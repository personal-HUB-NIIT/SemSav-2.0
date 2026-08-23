import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  uploader_id: string;
  branch_id: string;
  semester: number;
  item_type: 'NOTE' | 'ASSIGNMENT' | 'TEST_DATE' | 'PYQ';
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  upvotes: number;
  downvotes: number;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  users?: { full_name: string } | { full_name: string }[] | null;
}

type FilterTab = 'all' | 'TEST_DATE' | 'ASSIGNMENT' | 'NOTE_PYQ';

interface LeaderboardEntry {
  id: string;
  full_name: string;
  karma_points: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: string; chip: string; barColor: string }> = {
  NOTE:       { label: 'Notes',       icon: '📄', chip: 'bg-blue-50 border-blue-200 text-blue-700',   barColor: 'bg-blue-500' },
  PYQ:        { label: 'PYQ',         icon: '📝', chip: 'bg-purple-50 border-purple-200 text-purple-700', barColor: 'bg-purple-500' },
  ASSIGNMENT: { label: 'Assignment',  icon: '📋', chip: 'bg-amber-50 border-amber-200 text-amber-700', barColor: 'bg-amber-500' },
  TEST_DATE:  { label: 'Test / Exam', icon: '🎓', chip: 'bg-red-50 border-red-200 text-red-700',     barColor: 'bg-red-500' },
};

const FALLBACK_TYPE_META = { label: 'Other', icon: '📁', chip: 'bg-slate-100 border-slate-200 text-slate-600', barColor: 'bg-slate-500' };

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'all',        label: 'All Pending',       icon: '🗳️' },
  { key: 'TEST_DATE',  label: 'Test & Exam Dates', icon: '🎓' },
  { key: 'ASSIGNMENT', label: 'Assignments',        icon: '📋' },
  { key: 'NOTE_PYQ',   label: 'Notes & PYQs',       icon: '📄' },
];

const KARMA_TIERS = [
  { min: 0,   label: 'Newcomer',    icon: '🌱', color: 'text-slate-600 bg-slate-100 border-slate-200',  barBg: 'bg-slate-200' },
  { min: 50,  label: 'Contributor', icon: '🤝', color: 'text-blue-700 bg-blue-50 border-blue-200',      barBg: 'bg-blue-200' },
  { min: 150, label: 'Reviewer',    icon: '🔍', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', barBg: 'bg-indigo-200' },
  { min: 300, label: 'Trusted',     icon: '🛡️', color: 'text-purple-700 bg-purple-50 border-purple-200', barBg: 'bg-purple-200' },
  { min: 500, label: 'Expert',      icon: '⭐', color: 'text-amber-700 bg-amber-50 border-amber-200',   barBg: 'bg-amber-200' },
];

function getKarmaTier(karma: number) {
  for (let i = KARMA_TIERS.length - 1; i >= 0; i--) {
    if (karma >= KARMA_TIERS[i].min) return KARMA_TIERS[i];
  }
  return KARMA_TIERS[0];
}

function getNextTier(karma: number) {
  for (const tier of KARMA_TIERS) {
    if (karma < tier.min) return tier;
  }
  return null;
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

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function extractSubjectCode(item: QueueItem): string | null {
  if (item.payload && typeof item.payload === 'object') {
    const sc = item.payload.subject_code;
    if (typeof sc === 'string' && sc.trim()) return sc.trim();
  }
  return null;
}

function extractPayloadChips(item: QueueItem): { key: string; value: string }[] {
  if (!item.payload || typeof item.payload !== 'object') return [];
  return Object.entries(item.payload)
    .filter(([k, v]) => v != null && String(v).trim() !== '' && k !== 'subject_code')
    .map(([k, v]) => ({ key: k.replace(/_/g, ' '), value: String(v) }));
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"
    />
  );
}

// ─── Queue Card ──────────────────────────────────────────────────────────────

interface QueueCardProps {
  item: QueueItem;
  myVote: 'UP' | 'DOWN' | null;
  requiredVotes: number;
  onVote: (queueId: string, voteType: 'UP' | 'DOWN') => void;
  voting: boolean;
}

function QueueCard({ item, myVote, requiredVotes, onVote, voting }: QueueCardProps) {
  const meta = TYPE_META[item.item_type] ?? FALLBACK_TYPE_META;
  const uploader = relOne(item.users);
  const subjectCode = extractSubjectCode(item);
  const payloadChips = extractPayloadChips(item);
  const totalVotes = item.upvotes + item.downvotes;
  const progressPct = Math.min(100, (item.upvotes / requiredVotes) * 100);
  const remaining = Math.max(0, requiredVotes - item.upvotes);
  const isVerified = item.upvotes >= requiredVotes;
  const isRejected = item.downvotes >= requiredVotes;

  return (
    <div className={`bg-white border rounded-2xl p-5 transition-all hover:shadow-md ${
      isVerified ? 'border-emerald-300 ring-1 ring-emerald-100'
      : isRejected ? 'border-red-300 ring-1 ring-red-100 opacity-60'
      : 'border-slate-200'
    }`}>
      {/* Status ribbon */}
      {isVerified && (
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 w-fit">
          ✅ Verified — Promoted to live data
        </div>
      )}
      {isRejected && (
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 w-fit">
          🚫 Rejected by community
        </div>
      )}

      {/* Header row: uploader + type badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-indigo-100 shrink-0">
            {uploader?.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{uploader?.full_name ?? 'Anonymous'}</p>
            <p className="text-[10px] text-slate-400">{timeAgo(item.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {subjectCode && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5">
              {subjectCode}
            </span>
          )}
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${meta.chip}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
      </div>

      {/* Title + Description */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h3>
        {item.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Payload chips */}
      {payloadChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {payloadChips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
              <span className="font-medium text-slate-500">{chip.key}:</span>
              <span className="font-semibold text-slate-700">{chip.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Progress section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-indigo-700">
              {item.upvotes} / {requiredVotes}
            </span>
            <span className="text-[10px] text-slate-400">votes needed</span>
          </div>
          {remaining > 0 && !isVerified && !isRejected && (
            <span className="text-[10px] text-slate-400">
              {remaining} more to verify
            </span>
          )}
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${meta.barColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Vote Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onVote(item.id, 'UP')}
          disabled={voting || myVote === 'UP' || isVerified || isRejected}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
            myVote === 'UP'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm shadow-emerald-100'
              : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          {myVote === 'UP' ? 'Voted ✓' : 'Verify'} ({item.upvotes})
        </button>
        <button
          onClick={() => onVote(item.id, 'DOWN')}
          disabled={voting || myVote === 'DOWN' || isVerified || isRejected}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
            myVote === 'DOWN'
              ? 'bg-red-50 border-red-300 text-red-700 shadow-sm shadow-red-100'
              : 'bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700 hover:bg-red-50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {myVote === 'DOWN' ? 'Flagged ✓' : 'Flag'} ({item.downvotes})
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function KarmaPoll() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [items, setItems]             = useState<QueueItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<FilterTab>('all');
  const [myVotes, setMyVotes]         = useState<Record<string, 'UP' | 'DOWN'>>({});
  const [votingId, setVotingId]       = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [requiredVotes, setRequired]  = useState(1);

  // ─── Fetch queue items ─────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (!profile?.branch_id || !profile?.semester) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('verification_queue')
      .select('*, users(full_name)')
      .eq('branch_id', profile.branch_id!)
      .eq('semester', profile.semester!)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error) {
      setItems((data ?? []) as QueueItem[]);
    }

    setLoading(false);
  }, [profile?.branch_id, profile?.semester]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ─── Fetch my votes ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.auth_id || items.length === 0) return;
    const ids = items.map(i => i.id);
    supabase
      .from('queue_votes')
      .select('queue_id, vote_type')
      .in('queue_id', ids)
      .eq('user_id', profile.auth_id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, 'UP' | 'DOWN'> = {};
        data.forEach((v: { queue_id: string; vote_type: string }) => {
          map[v.queue_id] = v.vote_type as 'UP' | 'DOWN';
        });
        setMyVotes(map);
      });
  }, [profile?.auth_id, items]);

  // ─── Calculate required votes ──────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', profile.branch_id!)
      .eq('semester', profile.semester!)
      .eq('is_banned', false)
      .then(({ count }) => {
        const total = count ?? 0;
        setRequired(Math.max(1, Math.ceil(total * 0.05)));
      });
  }, [profile?.branch_id, profile?.semester]);

  // ─── Fetch leaderboard (top 5) ────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    supabase
      .from('users')
      .select('id, full_name, karma_points')
      .eq('branch_id', profile.branch_id!)
      .eq('semester', profile.semester!)
      .eq('is_banned', false)
      .order('karma_points', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setLeaderboard(data as LeaderboardEntry[]);
      });
  }, [profile?.branch_id, profile?.semester]);

  // ─── Vote handler ──────────────────────────────────────────────────────────

  const handleVote = async (queueId: string, voteType: 'UP' | 'DOWN') => {
    if (!profile?.auth_id) { toast.error('Please sign in to vote'); return; }
    setVotingId(queueId);

    const { data, error } = await supabase.rpc('handle_queue_vote', {
      p_queue_id:  queueId,
      p_user_id:   profile.auth_id,
      p_vote_type: voteType,
    });

    if (error) {
      toast.error(error.message);
    } else if (data && typeof data === 'object' && 'error' in data) {
      toast.error(String(data.error));
    } else {
      toast.success(voteType === 'UP' ? 'Vote recorded! +2 karma' : 'Flag recorded! +2 karma');
      setMyVotes(prev => ({ ...prev, [queueId]: voteType }));
      fetchItems();
    }

    setVotingId(null);
  };

  // ─── Filtered items ────────────────────────────────────────────────────────

  const filtered = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'NOTE_PYQ') return item.item_type === 'NOTE' || item.item_type === 'PYQ';
    return item.item_type === filter;
  });

  const tier = getKarmaTier(profile?.karma_points ?? 0);
  const nextTier = getNextTier(profile?.karma_points ?? 0);
  const tierProgress = nextTier
    ? ((profile?.karma_points ?? 0) - tier.min) / (nextTier.min - tier.min) * 100
    : 100;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Nav */}
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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">Karma Poll</h1>
              <p className="text-[10px] text-slate-500 truncate">Community verification for shared resources</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${tier.color}`}>
              {tier.icon} {tier.label}
            </span>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              ⭐ {profile?.karma_points ?? 0}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header card with karma balance + rank */}
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-200 shrink-0">
              {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Your Karma Balance</p>
              <p className="text-2xl font-extrabold text-slate-900">⭐ {profile?.karma_points ?? 0}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tier.color}`}>
                  {tier.icon} {tier.label}
                </span>
                {nextTier && (
                  <span className="text-[10px] text-slate-400">
                    {nextTier.min - (profile?.karma_points ?? 0)} pts to {nextTier.icon} {nextTier.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Tier progress bar */}
          <div className="flex-1 w-full sm:w-auto">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${tierProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* How it works banner */}
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl shrink-0">💡</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900">How the 5% Batch Consensus works</p>
            <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
              When a peer uploads notes, assignments, or exam dates, the community votes to verify accuracy.
              Once <strong>5% of your branch + semester students</strong> upvote (min. 1 vote),
              the item is <strong>auto-verified</strong> and promoted to live data.
              The uploader earns <strong>+25 karma</strong>, and you earn <strong>+2 karma</strong> for every vote you cast.
              Rejected items are hidden from the feed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {FILTER_TABS.map(tab => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all ${
                    filter === tab.key
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                  }`}>
                  <span>{tab.icon}</span>
                  {tab.label}
                  {tab.key === 'all' && items.length > 0 && (
                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      filter === tab.key ? 'bg-indigo-500' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {items.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Queue List */}
            {loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                      <div className="space-y-1.5">
                        <div className="h-3 bg-slate-100 rounded w-24" />
                        <div className="h-2 bg-slate-100 rounded w-16" />
                      </div>
                    </div>
                    <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                    <div className="h-2.5 bg-slate-100 rounded-full mb-3" />
                    <div className="flex gap-2">
                      <div className="h-9 bg-slate-100 rounded-xl flex-1" />
                      <div className="h-9 bg-slate-100 rounded-xl flex-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3 opacity-40">✅</div>
                <p className="text-sm font-semibold text-slate-900 mb-1">Nothing to verify</p>
                <p className="text-xs text-slate-500">
                  {filter === 'all'
                    ? 'No pending items in the queue for your branch & semester.'
                    : 'No pending items in this category.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map(item => (
                  <QueueCard
                    key={item.id}
                    item={item}
                    myVote={myVotes[item.id] ?? null}
                    requiredVotes={requiredVotes}
                    onVote={handleVote}
                    voting={votingId === item.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar: Leaderboard */}
          <div className="lg:col-span-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden sticky top-24">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">🏆 Top Contributors</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your branch & semester</p>
              </div>
              <div className="p-3">
                {leaderboard.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No contributors yet</p>
                ) : (
                  <div className="space-y-1">
                    {leaderboard.map((entry, i) => {
                      const entryTier = getKarmaTier(entry.karma_points);
                      const isMe = entry.id === profile?.id;
                      return (
                        <div key={entry.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                            isMe ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
                          }`}>
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            i === 0 ? 'bg-amber-100 text-amber-700'
                            : i === 1 ? 'bg-slate-200 text-slate-600'
                            : i === 2 ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-100 text-slate-500'
                          }`}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${isMe ? 'text-indigo-900' : 'text-slate-800'}`}>
                              {entry.full_name}
                              {isMe && <span className="text-indigo-500 ml-1">(you)</span>}
                            </p>
                            <p className={`text-[10px] font-medium ${entryTier.color.split(' ')[0]}`}>
                              {entryTier.icon} {entryTier.label}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-amber-600 shrink-0 tabular-nums">
                            ⭐ {entry.karma_points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
