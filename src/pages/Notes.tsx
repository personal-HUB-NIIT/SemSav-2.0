import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { BookOpen, FileText, ClipboardList, CalendarDays } from 'lucide-react';
import Tabs from '../components/Tabs';
import Button from '../components/Button';
import { SubjectCardSkeleton, UploadCardSkeleton } from '../components/Skeleton';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  is_lab: boolean;
}

interface StudyMaterial {
  id: string;
  upload_id: string;
  material_type: 'NOTE' | 'ASSIGNMENT';
  title: string;
  file_url: string | null;
  created_at: string;
  uploader_name: string | null;
}

type TabType = 'notes' | 'assignments';

function dateKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(dateKey: string): string {
  const [y, m, dd] = dateKey.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

function groupByDateDesc<T extends { created_at: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = dateKeyOf(it.created_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function Notes() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [subjects, setSubjects]           = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});

  const [tab, setTab]                     = useState<TabType>('notes');
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [assignments, setAssignments]     = useState<StudyMaterial[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [search, setSearch]               = useState('');

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    setSubjectsLoading(true);
    supabase
      .from('subjects')
      .select('id, subject_name, subject_code, is_lab')
      .eq('branch_id', profile.branch_id)
      .eq('semester', profile.semester)
      .order('subject_name')
      .then(({ data, error }) => { if (!error) setSubjects(data ?? []); setSubjectsLoading(false); });
  }, [profile?.branch_id, profile?.semester]);

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
        data.forEach((r: { subject_id: string }) => { counts[r.subject_id] = (counts[r.subject_id] ?? 0) + 1; });
        setSubjectCounts(counts);
      });
  }, [profile?.branch_id, profile?.semester, subjects]);

  const fetchUploads = useCallback(async () => {
    if (!selectedSubject || !profile?.branch_id || !profile?.semester) return;
    setUploadsLoading(true);
    const notesPromise = supabase
      .from('study_materials')
      .select('id, upload_id, material_type, title, file_url, created_at, uploader_name')
      .eq('subject_id', selectedSubject.id).eq('branch_id', profile.branch_id!).eq('semester', profile.semester!)
      .eq('material_type', 'NOTE').order('created_at', { ascending: false });
    const assignmentsPromise = supabase
      .from('study_materials')
      .select('id, upload_id, material_type, title, file_url, created_at, uploader_name')
      .eq('subject_id', selectedSubject.id).eq('branch_id', profile.branch_id!).eq('semester', profile.semester!)
      .eq('material_type', 'ASSIGNMENT').order('created_at', { ascending: false });
    const [notesResult, assignmentsResult] = await Promise.all([notesPromise, assignmentsPromise]);
    if (!notesResult.error) setStudyMaterials((notesResult.data ?? []) as StudyMaterial[]);
    if (!assignmentsResult.error) setAssignments((assignmentsResult.data ?? []) as StudyMaterial[]);
    setUploadsLoading(false);
  }, [selectedSubject, profile?.branch_id, profile?.semester]);

  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  const filteredNotes = studyMaterials.filter(item => !search || item.title.toLowerCase().includes(search.toLowerCase()));
  const filteredAssignments = assignments.filter(item => !search || item.title.toLowerCase().includes(search.toLowerCase()));
  const filtered = tab === 'notes' ? filteredNotes : filteredAssignments;

  if (!selectedSubject) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-white">
        <header className="glass border-b border-white/10 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigate('/dashboard')}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" aria-label="Back">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-white truncate">Study Materials</h1>
                <p className="text-[10px] text-gray-400 truncate">Semester {profile?.semester ?? '—'} · {subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
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
            <div className="glass rounded-2xl p-10 text-center border border-white/10">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-semibold text-white mb-1">No subjects found</p>
              <p className="text-xs text-gray-400">No subjects are configured for your branch & semester yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map(subject => (
                <button key={subject.id} onClick={() => setSelectedSubject(subject)}
                  className="glass rounded-2xl p-5 text-left hover:border-white/20 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{subject.subject_name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">{subject.subject_code}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/15">
                      {subjectCounts[subject.id] ?? 0} file{(subjectCounts[subject.id] ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {subject.is_lab && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/25 text-purple-300">Lab</span>
                    )}
                    <span className="text-[10px] text-gray-500">
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

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <header className="glass border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => { setSelectedSubject(null); setSearch(''); }}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" aria-label="Back">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-white truncate">{selectedSubject.subject_name}</h1>
              <p className="text-[10px] text-gray-500 truncate font-mono">{selectedSubject.subject_code}</p>
            </div>
          </div>
          <div className="relative hidden sm:block shrink-0 w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/15 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="relative sm:hidden">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/15 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all" />
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            tabs={[
              { key: 'notes', label: 'Notes' },
              { key: 'assignments', label: 'Assignments' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as TabType)}
          />
          <span className="ml-auto text-xs text-gray-500">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {uploadsLoading ? (
          <div className="space-y-3">{[0,1,2].map(i => <UploadCardSkeleton key={i} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/10">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-sm font-semibold text-white mb-1">
              {search ? 'No results found' : tab === 'notes' ? 'No verified notes yet' : 'No assignments uploaded yet'}
            </p>
            <p className="text-xs text-gray-400">
              {search ? 'Try a different search term' : tab === 'notes' ? 'Notes appear here once verified by classmates (5% upvotes).' : 'Be the first to contribute materials for this subject!'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupByDateDesc(filtered as StudyMaterial[]).map(([dateKey, dayItems]) => (
              <div key={dateKey}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 uppercase tracking-wider">
                    <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
                    {formatDayLabel(dateKey)}
                  </span>
                  <span className="text-[10px] text-gray-500">{dayItems.length} item{dayItems.length !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <div className="space-y-3">
                  {(dayItems as StudyMaterial[]).map(item => (
                    <div key={item.id} className="glass rounded-2xl p-5 hover:border-white/20 transition-all">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                          tab === 'notes' ? 'bg-blue-500/15 border-blue-400/25 text-blue-300' : 'bg-amber-500/15 border-amber-400/25 text-amber-300'
                        }`}>
                          {tab === 'notes' ? <FileText className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">{item.title}</h3>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  tab === 'notes' ? 'bg-blue-500/15 border-blue-400/25 text-blue-300' : 'bg-amber-500/15 border-amber-400/25 text-amber-300'
                                }`}>
                                  {tab === 'notes' ? 'Notes' : 'Assignment'}
                                </span>
                                <span className="text-[10px] font-medium text-gray-400 inline-flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" />
                                  {formatDayLabel(dateKeyOf(item.created_at))}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  at {new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                              </div>
                              {item.uploader_name && <p className="text-[10px] text-gray-500 mt-1">by {item.uploader_name}</p>}
                            </div>
                            {item.file_url && (
                              <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                                className="shrink-0">
                                <Button variant="primary" size="sm">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Open
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}