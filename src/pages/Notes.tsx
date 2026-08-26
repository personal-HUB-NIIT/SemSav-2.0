import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  is_lab: boolean;
}

interface UploadItem {
  id: string;
  title_syllabus: string;
  category: 'NOTES' | 'ASSIGNMENT' | 'TEST';
  file_url: string | null;
  due_date_time: string | null;
  created_at: string;
  net_score: number;
  users?: { full_name: string } | { full_name: string }[] | null;
}

interface StudyMaterial {
  id: string;
  upload_id: string;
  title: string;
  file_url: string | null;
  created_at: string;
  uploader_name: string | null;
}

type TabType = 'notes' | 'assignments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function dueTag(iso: string): { label: string; tone: 'overdue' | 'urgent' | 'soon' | 'calm' } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(iso).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86400000);
  if (days < 0)  return { label: 'Overdue', tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'urgent' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'urgent' };
  if (days <= 3) return { label: `Due in ${days}d`, tone: 'soon' };
  return { label: `Due in ${days}d`, tone: 'calm' };
}

const DUE_STYLES: Record<string, string> = {
  overdue: 'bg-red-100 text-red-700',
  urgent: 'bg-orange-100 text-orange-700',
  soon: 'bg-indigo-100 text-indigo-700',
  calm: 'bg-slate-100 text-slate-600',
};

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  NOTES:      { label: 'Notes',      icon: '📄', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  ASSIGNMENT: { label: 'Assignment', icon: '📋', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  TEST:       { label: 'Test/Exam',  icon: '🎓', color: 'bg-red-50 border-red-200 text-red-700' },
};

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }}
      className="border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SubjectCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="h-4 bg-slate-100 rounded w-32" />
          <div className="h-3 bg-slate-100 rounded w-16" />
        </div>
        <div className="h-5 bg-slate-100 rounded-full w-12" />
      </div>
      <div className="h-2 bg-slate-100 rounded-full w-full" />
    </div>
  );
}

function UploadCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-100 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Notes() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [subjects, setSubjects]           = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});

  // Detail view state
  const [tab, setTab]                     = useState<TabType>('notes');
  const [uploads, setUploads]             = useState<UploadItem[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [search, setSearch]               = useState('');
  const [unitFilter, setUnitFilter]       = useState<string>('all');

  // ─── Fetch subjects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    setSubjectsLoading(true);
    supabase
      .from('subjects')
      .select('id, subject_name, subject_code, is_lab')
      .eq('branch_id', profile.branch_id)
      .eq('semester', profile.semester)
      .order('subject_name')
      .then(({ data, error }) => {
        if (!error) setSubjects(data ?? []);
        setSubjectsLoading(false);
      });
  }, [profile?.branch_id, profile?.semester]);

  // ─── Fetch study material counts per subject ──────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester || subjects.length === 0) return;
    const subjectIds = subjects.map(s => s.id);
    supabase
      .from('study_materials')
      .select('subject_id')
      .eq('branch_id', profile.branch_id!)
      .eq('semester', profile.semester!)
      .in('subject_id', subjectIds)
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        data.forEach((r: { subject_id: string }) => {
          counts[r.subject_id] = (counts[r.subject_id] ?? 0) + 1;
        });
        setSubjectCounts(counts);
      });
  }, [profile?.branch_id, profile?.semester, subjects]);

  // ─── Fetch study materials (verified notes) + uploads (assignments/tests) ──

  const fetchUploads = useCallback(async () => {
    if (!selectedSubject || !profile?.branch_id || !profile?.semester) return;
    setUploadsLoading(true);

    // Fetch verified notes from study_materials
    const notesPromise = supabase
      .from('study_materials')
      .select('id, upload_id, title, file_url, created_at, uploader_name')
      .eq('subject_id', selectedSubject.id)
      .eq('branch_id', profile.branch_id!)
      .eq('semester', profile.semester!)
      .order('created_at', { ascending: false });

    // Fetch verified assignments/tests from uploads
    const assignmentsPromise = supabase
      .from('uploads')
      .select('id, title_syllabus, category, file_url, due_date_time, created_at, net_score, users(full_name)')
      .eq('subject_id', selectedSubject.id)
      .eq('status', 'VERIFIED')
      .in('category', ['ASSIGNMENT', 'TEST'])
      .order('created_at', { ascending: false });

    const [notesResult, assignmentsResult] = await Promise.all([notesPromise, assignmentsPromise]);

    if (!notesResult.error) setStudyMaterials((notesResult.data ?? []) as StudyMaterial[]);
    if (!assignmentsResult.error) setUploads((assignmentsResult.data ?? []) as UploadItem[]);

    setUploadsLoading(false);
  }, [selectedSubject, profile?.branch_id, profile?.semester]);

  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const filteredNotes = studyMaterials.filter(item => {
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredAssignments = uploads.filter(item => {
    if (search && !item.title_syllabus.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filtered = tab === 'notes' ? filteredNotes : filteredAssignments;

  // ─── Render: Subject Grid ──────────────────────────────────────────────────

  if (!selectedSubject) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigate('/dashboard')}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all shrink-0" aria-label="Back">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">📚 Study Materials</h1>
                <p className="text-[10px] text-slate-500 truncate">Semester {profile?.semester ?? '—'} · {subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {subjectsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0,1,2,3,4,5].map(i => <SubjectCardSkeleton key={i} />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <div className="text-4xl mb-3 opacity-40">📚</div>
              <p className="text-sm font-semibold text-slate-900 mb-1">No subjects found</p>
              <p className="text-xs text-slate-500">No subjects are configured for your branch & semester yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map(subject => (
                <button key={subject.id} onClick={() => setSelectedSubject(subject)}
                  className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-indigo-300 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {subject.subject_name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{subject.subject_code}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      {subjectCounts[subject.id] ?? 0} file{(subjectCounts[subject.id] ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {subject.is_lab && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700">
                        🧪 Lab
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {subjectCounts[subject.id] === 0 ? 'No uploads yet' : 'View materials →'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── Render: Subject Detail View ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => { setSelectedSubject(null); setSearch(''); setUnitFilter('all'); }}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all shrink-0" aria-label="Back">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{selectedSubject.subject_name}</h1>
              <p className="text-[10px] text-slate-500 truncate font-mono">{selectedSubject.subject_code}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative hidden sm:block shrink-0 w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Mobile search */}
        <div className="relative sm:hidden">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          {([
            { key: 'notes' as TabType, label: 'Daily Notes', icon: '📄' },
            { key: 'assignments' as TabType, label: 'Assignments & Labs', icon: '📋' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                tab === t.key
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
              }`}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Content */}
        {uploadsLoading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <UploadCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3 opacity-40">{tab === 'notes' ? '📄' : '📋'}</div>
            <p className="text-sm font-semibold text-slate-900 mb-1">
              {search ? 'No results found' : tab === 'notes' ? 'No verified notes yet' : 'No assignments uploaded yet'}
            </p>
            <p className="text-xs text-slate-500">
              {search ? 'Try a different search term' : tab === 'notes' ? 'Notes appear here once verified by classmates (5% upvotes).' : 'Be the first to contribute materials for this subject!'}
            </p>
          </div>
        ) : tab === 'notes' ? (
          <div className="space-y-3">
            {(filtered as StudyMaterial[]).map(item => (
              <div key={item.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl border flex items-center justify-center text-sm shrink-0 bg-blue-50 border-blue-200 text-blue-700">
                    📄
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 truncate">{item.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 border-blue-200 text-blue-700">
                            Notes
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Uploaded {timeAgo(item.created_at)}
                          </span>
                        </div>
                        {item.uploader_name && (
                          <p className="text-[10px] text-slate-400 mt-1">by {item.uploader_name}</p>
                        )}
                      </div>
                      {item.file_url && (
                        <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-xl hover:bg-indigo-100 transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(filtered as UploadItem[]).map(item => {
              const meta = CATEGORY_META[item.category] ?? { label: item.category, icon: '📁', color: 'bg-slate-100 border-slate-200 text-slate-600' };
              const uploader = relOne(item.users);
              const tag = item.due_date_time ? dueTag(item.due_date_time) : null;

              return (
                <div key={item.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-sm shrink-0 ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{item.title_syllabus}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                              {meta.label}
                            </span>
                            {item.due_date_time && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DUE_STYLES[tag?.tone ?? 'calm']}`}>
                                {tag?.label}
                              </span>
                            )}
                          </div>
                          {uploader && (
                            <p className="text-[10px] text-slate-400 mt-1">by {uploader.full_name}</p>
                          )}
                        </div>
                        {item.file_url && (
                          <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-xl hover:bg-indigo-100 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Open
                          </a>
                        )}
                      </div>
                      {item.due_date_time && (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-4 text-[11px] text-slate-600">
                          <span>📅 Due: {formatDateTime(item.due_date_time)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
