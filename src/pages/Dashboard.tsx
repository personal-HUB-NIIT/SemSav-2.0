import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface Upload {
  id: string;
  title_syllabus: string;
  category: 'NOTES' | 'ASSIGNMENT' | 'TEST';
  status: 'UNVERIFIED' | 'VERIFIED' | 'PURGED';
  net_score: number;
  due_date_time: string | null;
  room_no: string | null;
  test_type: string | null;
  file_url: string;
  created_at: string;
  subjects: { subject_name: string; subject_code: string } | null;
  users: { full_name: string; karma_points: number } | null;
  user_vote?: 'UP' | 'DOWN' | null;
}

const CATEGORY_COLORS = {
  NOTES:      { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   label: '📝 Notes' },
  ASSIGNMENT: { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  label: '📋 Assignment' },
  TEST:       { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    label: '📅 Test' },
};

const STATUS_COLORS = {
  VERIFIED:   'text-emerald-400',
  UNVERIFIED: 'text-slate-500',
  PURGED:     'text-red-400',
};

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return 'Passed';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return 'Due soon!';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [uploads, setUploads]       = useState<Upload[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<'ALL' | 'NOTES' | 'ASSIGNMENT' | 'TEST'>('ALL');
  const [votingId, setVotingId]     = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [summaryModal, setSummaryModal] = useState<{ title: string; content: string } | null>(null);

  const fetchUploads = useCallback(async () => {
    if (!profile?.branch_id || !profile?.semester) return;
    setLoading(true);

    // Fetch uploads for user's branch & semester
    const query = supabase
      .from('uploads')
      .select(`
        id, title_syllabus, category, status, net_score,
        due_date_time, room_no, test_type, file_url, created_at,
        subjects ( subject_name, subject_code ),
        users ( full_name, karma_points )
      `)
      .eq('branch_id', profile.branch_id)
      .eq('semester', profile.semester)
      .neq('status', 'PURGED')
      .order('created_at', { ascending: false })
      .limit(50);

    if (activeTab !== 'ALL') {
      query.eq('category', activeTab);
    }

    const { data: uploadData, error } = await query;

    if (error) {
      toast.error('Failed to load content');
      setLoading(false);
      return;
    }

    if (!uploadData) { setLoading(false); return; }

    // Fetch user's existing votes for these uploads
    const uploadIds = uploadData.map(u => u.id);
    let voteMap: Record<string, 'UP' | 'DOWN'> = {};

    if (uploadIds.length > 0) {
      const { data: votes } = await supabase
        .from('votes')
        .select('upload_id, vote_type')
        .eq('user_id', profile.id)
        .in('upload_id', uploadIds);

      votes?.forEach(v => { voteMap[v.upload_id] = v.vote_type; });
    }

    setUploads(uploadData.map(u => ({ ...u, user_vote: voteMap[u.id] ?? null })));
    setLoading(false);
  }, [profile, activeTab]);

  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  const handleVote = async (upload: Upload, voteType: 'UP' | 'DOWN') => {
    if (!profile) return;
    setVotingId(upload.id);
    try {
      if (upload.user_vote === voteType) {
        // Remove vote
        await supabase.from('votes').delete()
          .eq('user_id', profile.id).eq('upload_id', upload.id);
      } else {
        // Upsert vote
        await supabase.from('votes').upsert({
          user_id: profile.id,
          upload_id: upload.id,
          vote_type: voteType,
        }, { onConflict: 'user_id,upload_id' });
      }
      await fetchUploads();
    } catch (err: any) {
      toast.error('Vote failed: ' + err.message);
    } finally {
      setVotingId(null);
    }
  };

  const handleSummarize = async (upload: Upload) => {
    if (!profile) return;
    setSummarizingId(upload.id);
    const loadingToast = toast.loading('✨ AI is summarizing...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch('http://127.0.0.1:3001/api/ai-summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ file_url: upload.file_url })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to summarize');

      setSummaryModal({ title: upload.title_syllabus, content: data.summary });
      toast.dismiss(loadingToast);
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    } finally {
      setSummarizingId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const tabs = [
    { key: 'ALL',        label: 'All',         icon: '📚' },
    { key: 'NOTES',      label: 'Notes',       icon: '📝' },
    { key: 'ASSIGNMENT', label: 'Assignments',  icon: '📋' },
    { key: 'TEST',       label: 'Tests',        icon: '📅' },
  ] as const;

  const branchLabel = profile?.branch_id ? 'Branch' : '—';

  return (
    <div className="min-h-screen bg-slate-900">

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full z-50">
            <div className="p-6 border-b border-slate-800">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-xl mb-4">
                {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <p className="text-white font-bold truncate">{profile?.full_name}</p>
              <p className="text-slate-500 text-sm truncate">{profile?.email}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-emerald-400 font-bold text-sm">{profile?.karma_points ?? 0}</span>
                <span className="text-slate-500 text-xs">karma points</span>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              <button onClick={() => { navigate('/dashboard'); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-indigo-600/20 text-sm font-medium">
                <span>🏠</span> Dashboard
              </button>
              <button onClick={() => { navigate('/upload'); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-all">
                <span>⬆️</span> Upload Content
              </button>
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 text-sm transition-all">
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Nav */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl">📚</span>
              <span className="text-white font-bold text-lg">SemSav</span>
            </div>
          </div>

          <div className="flex-1 max-w-xs hidden sm:block">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search content..." className="bg-transparent text-sm text-white placeholder-slate-500 outline-none w-full" readOnly />
            </div>
          </div>

          <button onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Welcome banner */}
        <div className="mb-6 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-xl">
              Welcome back, {profile?.full_name?.split(' ')[0]} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Semester {profile?.semester} • {branchLabel} •{' '}
              <span className="text-emerald-400 font-semibold">{profile?.karma_points ?? 0} karma</span>
            </p>
          </div>
          <div className="hidden sm:block text-4xl">🎓</div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
                activeTab === tab.key
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content grid */}
        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/4 mb-3" />
                <div className="h-5 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-4 bg-slate-700 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-30">📂</div>
            <h3 className="text-white font-semibold text-lg mb-2">No content yet</h3>
            <p className="text-slate-500 text-sm mb-6">
              Be the first to share notes or assignments for your branch and semester!
            </p>
            <button onClick={() => navigate('/upload')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">
              Upload the first one 🚀
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {uploads.map(upload => {
              const cat = CATEGORY_COLORS[upload.category];
              const isVoting = votingId === upload.id;

              return (
                <div key={upload.id}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-all group">
                  <div className="flex items-start gap-4">

                    {/* Vote column */}
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                      <button
                        onClick={() => handleVote(upload, 'UP')}
                        disabled={isVoting}
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                          upload.user_vote === 'UP'
                            ? 'text-emerald-400 bg-emerald-500/20'
                            : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        <svg className="w-5 h-5" fill={upload.user_vote === 'UP' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <span className={`text-sm font-bold ${
                        upload.net_score > 0 ? 'text-emerald-400' :
                        upload.net_score < 0 ? 'text-red-400' : 'text-slate-500'
                      }`}>
                        {upload.net_score}
                      </span>
                      <button
                        onClick={() => handleVote(upload, 'DOWN')}
                        disabled={isVoting}
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                          upload.user_vote === 'DOWN'
                            ? 'text-red-400 bg-red-500/20'
                            : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <svg className="w-5 h-5" fill={upload.user_vote === 'DOWN' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${cat.bg} ${cat.border} ${cat.text}`}>
                          {cat.label}
                        </span>
                        {upload.subjects && (
                          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                            {upload.subjects.subject_code}
                          </span>
                        )}
                        <span className={`text-xs ml-auto ${STATUS_COLORS[upload.status]}`}>
                          {upload.status === 'VERIFIED' ? '✅ Verified' :
                           upload.status === 'UNVERIFIED' ? '⏳ Pending' : '🚫 Purged'}
                        </span>
                      </div>

                      <h3 className="text-white font-semibold text-base mb-1 truncate group-hover:text-indigo-300 transition-colors">
                        {upload.title_syllabus}
                      </h3>

                      {upload.subjects && (
                        <p className="text-slate-500 text-sm mb-2">{upload.subjects.subject_name}</p>
                      )}

                      {(upload.due_date_time) && (
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-amber-400 text-xs font-medium">{timeUntil(upload.due_date_time)}</span>
                          <span className="text-slate-600 text-xs">• {formatDate(upload.due_date_time)}</span>
                        </div>
                      )}

                      {upload.room_no && (
                        <p className="text-slate-500 text-xs mb-2">📍 Room: {upload.room_no}</p>
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
                            {upload.users?.full_name?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <span className="text-slate-500 text-xs">{upload.users?.full_name}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {upload.category === 'NOTES' && (
                            <button
                              onClick={() => handleSummarize(upload)}
                              disabled={summarizingId === upload.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                            >
                              {summarizingId === upload.id ? (
                                <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                              ) : '✨'} Summarize
                            </button>
                          )}
                          <a
                            href={upload.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </a>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Modal */}
      {summaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSummaryModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 w-full max-w-xl rounded-2xl p-6 shadow-2xl">
            <button onClick={() => setSummaryModal(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <span className="text-2xl">✨</span> AI Summary
            </h3>
            <p className="text-slate-400 text-sm mb-4">{summaryModal.title}</p>
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-slate-300 leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                {summaryModal.content}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
