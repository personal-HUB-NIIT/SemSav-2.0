import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft, Star, FileText, ClipboardList, GraduationCap, Folder,
  Clock, CheckCircle2, XCircle, ThumbsUp, ThumbsDown, Sparkles, ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoteInfo {
  vote_type: 'UP' | 'DOWN';
  users?: { full_name: string; avatar_url: string | null } | { full_name: string; avatar_url: string | null }[] | null;
}

interface Contribution {
  id: string;
  title_syllabus: string;
  category: 'NOTES' | 'ASSIGNMENT' | 'TEST';
  test_type: string | null;
  due_date_time: string | null;
  file_url: string | null;
  created_at: string;
  status: 'UNVERIFIED' | 'VERIFIED' | 'PURGED';
  net_score: number;
  subjects?: { subject_name: string; subject_code: string } | { subject_name: string; subject_code: string }[] | null;
  votes?: VoteInfo[];
}

type FilterTab = 'all' | 'UNVERIFIED' | 'VERIFIED' | 'PURGED';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; Icon: typeof FileText; chip: string }> = {
  NOTES:      { label: 'Notes',      Icon: FileText,      chip: 'bg-blue-50 border-blue-200 text-blue-700' },
  ASSIGNMENT: { label: 'Assignment', Icon: ClipboardList, chip: 'bg-amber-50 border-amber-200 text-amber-700' },
  TEST:       { label: 'Test / Exam', Icon: GraduationCap, chip: 'bg-red-50 border-red-200 text-red-700' },
};

const FALLBACK_TYPE_META = { label: 'Other', Icon: Folder, chip: 'bg-white/10 border-white/10 text-gray-400' };

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'UNVERIFIED', label: 'Pending Review' },
  { key: 'VERIFIED',   label: 'Verified' },
  { key: 'PURGED',     label: 'Rejected' },
];

const STATUS_META: Record<Contribution['status'], { label: string; chip: string; Icon: typeof Clock; hint: string }> = {
  UNVERIFIED: { label: 'Pending Review', chip: 'bg-amber-50 border-amber-200 text-amber-700',        Icon: Clock,       hint: 'Awaiting community votes' },
  VERIFIED:   { label: 'Verified',       chip: 'bg-emerald-50 border-emerald-200 text-emerald-700',  Icon: CheckCircle2, hint: '+25 karma earned' },
  PURGED:     { label: 'Rejected',       chip: 'bg-red-50 border-red-200 text-red-700',              Icon: XCircle,     hint: '-15 karma · hidden from vault' },
};

const KARMA_TIERS = [
  { min: 0,   label: 'Newcomer',    color: 'text-gray-400 bg-white/10 border-white/10' },
  { min: 50,  label: 'Contributor', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { min: 150, label: 'Reviewer',    color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { min: 300, label: 'Trusted',     color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { min: 500, label: 'Expert',      color: 'text-amber-700 bg-amber-50 border-amber-200' },
];

function getKarmaTier(karma: number) {
  for (let i = KARMA_TIERS.length - 1; i >= 0; i--) {
    if (karma >= KARMA_TIERS[i].min) return KARMA_TIERS[i];
  }
  return KARMA_TIERS[0];
}

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function voterName(v: VoteInfo): string | null {
  const u = relOne(v.users);
  return u?.full_name ?? null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KarmaPoll() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [items, setItems]   = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');

  const tier = getKarmaTier(profile?.karma_points ?? 0);

  // ─── Fetch my contributions ────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('uploads')
      .select('id, title_syllabus, category, test_type, due_date_time, file_url, created_at, status, net_score, subjects(subject_name, subject_code), votes(vote_type, users(full_name, avatar_url))')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) setItems((data ?? []) as Contribution[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const verifiedCount = items.filter(i => i.status === 'VERIFIED').length;
  const pendingCount  = items.filter(i => i.status === 'UNVERIFIED').length;
  const upvotesReceived = items.reduce((n, i) => n + (i.votes?.filter(v => v.vote_type === 'UP').length ?? 0), 0);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-xl border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white truncate">My Contributions</h1>
            <p className="text-[10px] text-gray-400 truncate">Your upload history and community verification status</p>
          </div>
          <span className="ml-auto shrink-0 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 flex items-center gap-1">
            <Star className="w-3.5 h-3.5" /> {profile?.karma_points ?? 0}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Karma summary */}
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="text-xs text-gray-400">Karma balance</p>
              <p className="text-2xl font-extrabold text-white flex items-center gap-1.5">
                <Star className="w-5 h-5 text-amber-500" /> {profile?.karma_points ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Contributions</p>
              <p className="text-2xl font-extrabold text-white">{items.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Verified</p>
              <p className="text-2xl font-extrabold text-emerald-600">{verifiedCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Pending</p>
              <p className="text-2xl font-extrabold text-amber-600">{pendingCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Upvotes received</p>
              <p className="text-2xl font-extrabold text-indigo-600 flex items-center gap-1">
                <ThumbsUp className="w-4 h-4" /> {upvotesReceived}
              </p>
            </div>
            <span className={`ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${tier.color}`}>
              <Sparkles className="w-3 h-3" /> {tier.label}
            </span>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all ${
                filter === tab.key
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-white border-white/10 text-gray-400 hover:border-indigo-300 hover:text-indigo-700'
              }`}>
              {tab.label}
              {tab.key === 'all' && items.length > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  filter === tab.key ? 'bg-indigo-500' : 'bg-white/10 text-gray-400'
                }`}>
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="border-2 border-white/15 border-t-indigo-500 rounded-full animate-spin w-6 h-6" />
            <span className="text-sm">Loading your contributions…</span>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <Folder className="w-10 h-10 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-semibold text-white mb-1">
              {items.length === 0 ? 'No contributions yet' : 'Nothing in this category'}
            </p>
            <p className="text-xs text-gray-400">
              {items.length === 0
                ? 'Upload notes, assignments or exam dates from the dashboard to earn karma.'
                : 'Try a different filter.'}
            </p>
          </div>
        )}

        {/* Contribution cards */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(item => {
              const meta = TYPE_META[item.category] ?? FALLBACK_TYPE_META;
              const status = STATUS_META[item.status] ?? STATUS_META.UNVERIFIED;
              const sub = relOne(item.subjects);
              const ups = item.votes?.filter(v => v.vote_type === 'UP') ?? [];
              const downs = item.votes?.filter(v => v.vote_type === 'DOWN') ?? [];
              const upNames = ups.map(voterName).filter(Boolean) as string[];
              const downNames = downs.map(voterName).filter(Boolean) as string[];

              return (
                <div key={item.id} className="glass rounded-2xl p-4 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${meta.chip}`}>
                      <meta.Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{item.title_syllabus}</p>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.chip}`}>
                          <status.Icon className="w-3 h-3" /> {status.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {sub ? `${sub.subject_name} (${sub.subject_code}) · ` : ''}
                        {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {item.status === 'VERIFIED' && item.file_url && (
                          <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                            className="ml-2 inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-800">
                            Open file <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </p>

                      {/* Vote summary (read-only) + voter identities */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <ThumbsUp className="w-3.5 h-3.5" /> {ups.length}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-red-500">
                          <ThumbsDown className="w-3.5 h-3.5" /> {downs.length}
                        </span>
                        {upNames.length > 0 && (
                          <span className="truncate">
                            Upvoted by <span className="font-medium text-gray-300">{upNames.slice(0, 2).join(', ')}</span>
                            {upNames.length > 2 && ` and ${upNames.length - 2} other${upNames.length > 3 ? 's' : ''}`}
                          </span>
                        )}
                        {downNames.length > 0 && (
                          <span className="truncate">
                            Flagged by <span className="font-medium text-gray-300">{downNames.slice(0, 2).join(', ')}</span>
                            {downNames.length > 2 && ` and ${downNames.length - 2} other${downNames.length > 3 ? 's' : ''}`}
                          </span>
                        )}
                        {ups.length === 0 && downs.length === 0 && (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <status.Icon className="w-3 h-3" /> {status.hint}
                          </span>
                        )}
                      </div>
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
