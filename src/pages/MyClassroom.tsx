import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Users, GraduationCap, Search, School } from 'lucide-react';

interface Classmate {
  id: string;
  full_name: string;
  avatar_url: string | null;
  karma_points: number;
  role: string;
  auth_id: string;
}

interface BranchInfo {
  branch_name: string;
  branch_code: string;
}

export default function MyClassroom() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ─── Fetch classmates ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    setLoading(true);

    supabase
      .from('users')
      .select('id, full_name, avatar_url, karma_points, role, auth_id')
      .eq('branch_id', profile.branch_id)
      .eq('semester', profile.semester)
      .eq('is_banned', false)
      .order('karma_points', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setClassmates((data ?? []) as Classmate[]);
        setLoading(false);
      });
  }, [profile?.branch_id, profile?.semester]);

  // ─── Fetch branch info bound to the authenticated user's profile ──────────

  useEffect(() => {
    if (!profile?.branch_id) { setBranchInfo(null); return; }
    supabase
      .from('branches')
      .select('branch_name, branch_code')
      .eq('id', profile.branch_id)
      .single()
      .then(({ data }) => { setBranchInfo((data as BranchInfo) ?? null); });
  }, [profile?.branch_id]);

  // ─── Filtered by search ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return classmates;
    const q = search.toLowerCase();
    return classmates.filter(c => c.full_name.toLowerCase().includes(q));
  }, [classmates, search]);

  // ─── Derive branch name from the authenticated user's profile ─────────────

  const branchName = branchInfo ? `${branchInfo.branch_code} — ${branchInfo.branch_name}` : '—';
  const semesterNum = profile?.semester ?? '?';

  // ─── Skeleton ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="space-y-4 animate-pulse">
            <div className="h-32 glass rounded-2xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className="h-28 glass rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>

        {/* Hero */}
        <div className="glass rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-xl text-white shadow-md shadow-indigo-100">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">My Classroom</h1>
                  <p className="text-sm text-gray-400">
                    {branchName} — Semester {semesterNum}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
              <GraduationCap className="w-5 h-5 text-indigo-500" />
              <div className="text-right">
                <p className="text-lg font-bold text-indigo-700">{classmates.length}</p>
                <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Students Enrolled</p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mt-5 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search classmates by name..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
            />
          </div>
        </div>

        {/* Empty search */}
        {filtered.length === 0 && classmates.length > 0 && (
          <div className="glass rounded-2xl p-10 text-center mb-6">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-semibold text-white mb-1">No classmates found</p>
            <p className="text-xs text-gray-400">Try a different search term</p>
          </div>
        )}

        {/* Empty classroom */}
        {classmates.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <School className="w-8 h-8 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-semibold text-white mb-1">No classmates yet</p>
            <p className="text-xs text-gray-400">Other students from your branch and semester will appear here once they sign up.</p>
          </div>
        )}

        {/* Student grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(student => {
            const isYou = student.auth_id === profile?.auth_id;
            const initials = student.full_name
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={student.id}
                className={`bg-white border rounded-2xl p-5 transition-all hover:shadow-md ${
                  isYou ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-white/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden ${
                    isYou
                      ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-100'
                      : 'bg-white/10 border border-white/10 text-gray-400'
                  }`}>
                    {student.avatar_url ? (
                      <img src={student.avatar_url} alt={student.full_name} className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{student.full_name}</h3>
                      {isYou && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        {student.karma_points} karma
                      </span>
                      {student.role === 'SUPER_ADMIN' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
