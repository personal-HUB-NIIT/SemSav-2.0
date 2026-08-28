import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

type Tab = 'UPLOADS' | 'USERS' | 'CURRICULUM' | 'FLAGGED';

interface Upload {
  id: string;
  title_syllabus: string;
  category: string;
  file_url: string;
  created_at: string;
  net_score: number;
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  subjects: { subject_code: string; subject_name: string } | { subject_code: string; subject_name: string }[] | null;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  enrollment_id: string | null;
  branch_id: string | null;
  semester: number | null;
  is_banned: boolean;
  role: string;
  karma_points: number;
  created_at: string;
  branches: { branch_code: string }[] | null;
}

interface Branch {
  id: string;
  branch_code: string;
  branch_name: string;
  total_semesters: number;
}

interface Subject {
  id: string;
  subject_code: string;
  subject_name: string;
  semester: number;
  branch_id: string;
}

interface FlaggedUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  enrollment_id: string | null;
  semester: number;
  karma_points: number;
  is_banned: boolean;
  report_count: number;
  flagged_upload_ids: string[];
  status: string;
  created_at: string;
}

interface ReportReason {
  reason: string | null;
  reporter_name: string;
  created_at: string;
}

interface UserUpload {
  id: string;
  title_syllabus: string;
  category: string;
  test_type: string | null;
  due_date_time: string | null;
  file_url: string | null;
  status: string;
  net_score: number;
  created_at: string;
  subject_name: string | null;
  subject_code: string | null;
  report_count: number;
  report_reasons: ReportReason[];
}

// Helper: Supabase returns embedded relations as object (one-to-one) or array depending on FK — handle both
function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<Tab>('UPLOADS');
  const [loading, setLoading] = useState(true);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [flaggedUsers, setFlaggedUsers] = useState<FlaggedUser[]>([]);
  const [selectedFlaggedUser, setSelectedFlaggedUser] = useState<FlaggedUser | null>(null);
  const [flaggedUserUploads, setFlaggedUserUploads] = useState<UserUpload[]>([]);
  const [loadingFlaggedUploads, setLoadingFlaggedUploads] = useState(false);

  // ─── User Directory filters & detail ───────────────────────────────────
  const [userSearch, setUserSearch] = useState('');
  const [userBranchFilter, setUserBranchFilter] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserUploads, setSelectedUserUploads] = useState<UserUpload[]>([]);
  const [loadingUserUploads, setLoadingUserUploads] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Form states for Curriculum
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubSem, setNewSubSem] = useState('1');
  const [newSubBranchId, setNewSubBranchId] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  // ─── Flagged user actions ──────────────────────────────────────────────

  const fetchFlaggedUserUploads = async (userId: string) => {
    setLoadingFlaggedUploads(true);
    const { data, error } = await supabase.rpc('get_user_uploads', { p_user_id: userId });
    if (!error) setFlaggedUserUploads(data || []);
    setLoadingFlaggedUploads(false);
  };

  const handleBanUser = async (flaggedUserId: string) => {
    if (!profile?.id) return;
    const { data, error } = await supabase.rpc('ban_flagged_user', {
      p_flagged_user_id: flaggedUserId,
      p_admin_id: profile.id,
    });
    if (error) {
      toast.error(error.message);
    } else if (data && typeof data === 'object' && 'error' in data) {
      toast.error(String(data.error));
    } else {
      toast.success('User banned successfully');
      setSelectedFlaggedUser(null);
      setFlaggedUserUploads([]);
      fetchData();
    }
  };

  const handleDismissUser = async (flaggedUserId: string) => {
    if (!profile?.id) return;
    const { error } = await supabase.rpc('dismiss_flagged_user', {
      p_flagged_user_id: flaggedUserId,
      p_admin_id: profile.id,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Report dismissed');
      setSelectedFlaggedUser(null);
      setFlaggedUserUploads([]);
      fetchData();
    }
  };

  // ─── Student Directory detail & delete ───────────────────────────────────
  const fetchSelectedUserUploads = async (userId: string) => {
    setLoadingUserUploads(true);
    const { data } = await supabase.rpc('get_user_uploads', { p_user_id: userId });
    setSelectedUserUploads((data as UserUpload[]) || []);
    setLoadingUserUploads(false);
  };

  const handleAdminDeleteUser = async () => {
    if (!selectedUser) return;
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    if (selectedUser.role === 'SUPER_ADMIN') {
      toast.error('Cannot delete an admin');
      return;
    }
    setDeletingUser(true);
    const { data, error } = await supabase.rpc('admin_delete_user', { p_target_user_id: selectedUser.id });
    if (error) {
      // PGRST202 = function not found in schema cache → migration 035 not applied
      const msg = error.message || '';
      const isSchemaCache = (error as unknown as { code?: string })?.code === 'PGRST202' || msg.includes('schema cache');
      if (isSchemaCache) {
        toast.error('Admin delete not available: run 035_admin_delete_user.sql in Supabase SQL Editor, then reload.', { duration: 6000 });
        console.error('Missing RPC public.admin_delete_user — apply supabase/migrations/035_admin_delete_user.sql. Raw error:', error);
      } else {
        toast.error(msg || 'Failed to delete user');
      }
    } else if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
      toast.error(String((data as Record<string, unknown>).error));
    } else {
      toast.success('User deleted — uploads retained as anonymous');
      setSelectedUser(null);
      setSelectedUserUploads([]);
      setDeleteConfirmText('');
      fetchData();
    }
    setDeletingUser(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'UPLOADS') {
        const { data } = await supabase
          .from('uploads')
          .select('id, title_syllabus, category, file_url, created_at, net_score, users(full_name, email), subjects(subject_code, subject_name)')
          .order('created_at', { ascending: false });
        setUploads(data || []);
      } else if (activeTab === 'USERS') {
        const { data } = await supabase
          .from('users')
          .select('id, full_name, email, enrollment_id, branch_id, semester, is_banned, role, karma_points, created_at, branches(branch_code)')
          .order('created_at', { ascending: false });
        setUsers(data || []);
        // Ensure branches are loaded for filter dropdown
        if (branches.length === 0) {
          const { data: bData } = await supabase.from('branches').select('*').order('branch_code');
          if (bData) setBranches(bData);
        }
      } else if (activeTab === 'CURRICULUM') {
        const { data: bData } = await supabase.from('branches').select('*').order('branch_code');
        const { data: sData } = await supabase.from('subjects').select('*').order('subject_code');
        setBranches(bData || []);
        setSubjects(sData || []);
        if (bData && bData.length > 0) setNewSubBranchId(bData[0].id);
      } else if (activeTab === 'FLAGGED') {
        const { data, error } = await supabase.rpc('get_flagged_users');
        if (!error) setFlaggedUsers(data || []);
      }
    } catch (err) {
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Actions
  const deleteUpload = async (id: string, fileUrl: string) => {
    if (!confirm('Are you sure you want to delete this upload?')) return;
    
    // Delete from DB
    const { error } = await supabase.from('uploads').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete upload record');
      return;
    }

    // Try deleting from storage (ignore if fails as file might already be gone)
    if (fileUrl) {
      // fileUrl might be full public URL or path. In our system it's typically the path.
      // But getPublicUrl is used to show it. We'll just delete from DB for now as SUPER_ADMIN
      // If we stored the raw path in `file_url`, we could delete it from storage easily.
      // Let's assume `fileUrl` is the path inside 'semsav-files'.
      const pathMatch = fileUrl.split('semsav-files/');
      if (pathMatch.length > 1) {
        const path = pathMatch[1];
        await supabase.storage.from('semsav-files').remove([path]);
      }
    }

    toast.success('Upload deleted');
    fetchData();
  };

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('branches').insert({
      branch_code: newBranchCode.toUpperCase(),
      branch_name: newBranchName,
      total_semesters: 8
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Branch added');
      setNewBranchCode('');
      setNewBranchName('');
      fetchData();
    }
  };

  const deleteBranch = async (id: string) => {
    if (!confirm('Delete this branch? This will delete all subjects and users associated with it!')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('subjects').insert({
      branch_id: newSubBranchId,
      semester: parseInt(newSubSem),
      subject_code: newSubCode.toUpperCase(),
      subject_name: newSubName
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Subject added');
      setNewSubCode('');
      setNewSubName('');
      fetchData();
    }
  };

  const deleteSubject = async (id: string) => {
    if (!confirm('Delete this subject? This deletes all associated uploads!')) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  return (
    <div className="min-h-screen bg-slate-900 relative z-10 text-white flex flex-col">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-xl border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-600/20 border border-amber-600/30 rounded-xl flex items-center justify-center">
            
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Admin Command Center</h1>
            <p className="text-xs text-amber-500 font-medium">Logged in as {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="text-sm bg-white/10 hover:bg-white/15 px-4 py-2 rounded-xl border border-white/10 transition-colors">
          Sign Out
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-1 space-y-2">
          {['UPLOADS', 'USERS', 'CURRICULUM', 'FLAGGED'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab as Tab); setSelectedFlaggedUser(null); setFlaggedUserUploads([]); }}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab 
                  ? 'bg-amber-600/10 text-amber-400 border border-amber-600/30' 
                  : 'hover:bg-white/10 text-gray-400 border border-white/10'
              }`}
            >
              {tab === 'UPLOADS' && 'Manage Uploads'}
              {tab === 'USERS' && 'User Directory'}
              {tab === 'CURRICULUM' && 'Curriculum (Branches)'}
              {tab === 'FLAGGED' && '⚠️ Flagged Users'}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 glass-strong rounded-2xl shadow-2xl p-6 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
            </div>
          ) : (
            <>
              {/* UPLOADS TAB */}
              {activeTab === 'UPLOADS' && (
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">All Uploads</h2>
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/10">
                        <th className="pb-3 font-medium">Document</th>
                        <th className="pb-3 font-medium">Subject</th>
                        <th className="pb-3 font-medium">Uploader</th>
                        <th className="pb-3 font-medium">Karma</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {uploads.map(u => (
                        <tr key={u.id} className="hover:bg-white/5">
                          <td className="py-4">
                            <div className="font-medium text-white">{u.title_syllabus}</div>
                            <div className="text-xs text-gray-400">{u.category} • {new Date(u.created_at).toLocaleDateString()}</div>
                          </td>
                           <td className="py-4 text-gray-400">{relOne(u.subjects)?.subject_code ?? '—'}</td>
                          <td className="py-4 text-gray-400">{relOne(u.users)?.full_name ?? <span className="italic text-gray-500">Deleted User</span>}</td>
                          <td className="py-4 text-amber-400 font-medium">{u.net_score}</td>
                          <td className="py-4 text-right space-x-3">
                            <a href={u.file_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">View</a>
                            <button onClick={() => deleteUpload(u.id, u.file_url)} className="text-red-400 hover:text-red-300">Delete</button>
                          </td>
                        </tr>
                      ))}
                      {uploads.length === 0 && (<tr><td colSpan={5} className="text-center py-8 text-gray-400">No uploads found.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}

              {/* USERS TAB */}
              {activeTab === 'USERS' && (() => {
                const filteredUsers = users.filter(u => {
                  const matchesBranch = userBranchFilter === 'ALL' || u.branch_id === userBranchFilter;
                  if (!matchesBranch) return false;
                  if (!userSearch.trim()) return true;
                  const q = userSearch.toLowerCase();
                  return (u.full_name?.toLowerCase().includes(q) || u.enrollment_id?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
                });
                return (
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">User Directory</h2>
                  {/* Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        placeholder="Search by name, enrollment ID, or email..."
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/15 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/50"
                      />
                    </div>
                    <select
                      value={userBranchFilter}
                      onChange={e => setUserBranchFilter(e.target.value)}
                      className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400/50 min-w-[160px]"
                    >
                      <option value="ALL" className="bg-gray-900">All Branches</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id} className="bg-gray-900">{b.branch_code} — {b.branch_name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{filteredUsers.length} of {users.length} users</p>
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/10">
                        <th className="pb-3 font-medium">Name</th>
                        <th className="pb-3 font-medium">Enrollment</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium">Branch</th>
                        <th className="pb-3 font-medium">Karma</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-white/5 cursor-pointer" onClick={() => { setSelectedUser(u); setDeleteConfirmText(''); fetchSelectedUserUploads(u.id); }}>
                          <td className="py-4">
                            <div className="font-medium text-white">{u.full_name}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </td>
                          <td className="py-4 text-gray-400 font-mono text-xs">{u.enrollment_id ?? '—'}</td>
                          <td className="py-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${u.role === 'SUPER_ADMIN' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-gray-300'}`}>
                              {u.role}
                            </span>
                            {u.is_banned && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">BANNED</span>}
                          </td>
                          <td className="py-4 text-gray-400">{u.branches?.[0]?.branch_code ?? 'N/A'}</td>
                          <td className="py-4 text-amber-400 font-medium">{u.karma_points}</td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No users match your filters.</td></tr>}
                    </tbody>
                  </table>

                  {/* Student Detail Modal */}
                  {selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedUser(null); setSelectedUserUploads([]); setDeleteConfirmText(''); }} />
                      <div className="relative bg-slate-900 border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                          <h3 className="text-lg font-bold text-white">Student Details</h3>
                          <button onClick={() => { setSelectedUser(null); setSelectedUserUploads([]); setDeleteConfirmText(''); }} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                              {selectedUser.full_name[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div>
                              <p className="text-white font-bold">{selectedUser.full_name}</p>
                              <p className="text-sm text-gray-400">{selectedUser.email}</p>
                              <p className="text-xs text-gray-500 font-mono">{selectedUser.enrollment_id ?? 'No enrollment'}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Karma</p>
                              <p className="text-lg font-bold text-amber-400">{selectedUser.karma_points}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Semester</p>
                              <p className="text-lg font-bold text-white">{selectedUser.semester ?? '—'}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Branch</p>
                              <p className="text-sm font-bold text-white">{selectedUser.branches?.[0]?.branch_code ?? 'N/A'}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                              <p className={`text-sm font-bold ${selectedUser.is_banned ? 'text-red-400' : 'text-emerald-400'}`}>{selectedUser.is_banned ? 'Banned' : 'Active'} • {selectedUser.role}</p>
                            </div>
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Contributions</p>
                            {loadingUserUploads ? (
                              <div className="flex items-center gap-2 text-sm text-gray-400"><div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> Loading…</div>
                            ) : (
                              <p className="text-sm text-white">{selectedUserUploads.length} uploads</p>
                            )}
                            {selectedUserUploads.length > 0 && (
                              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
                                {selectedUserUploads.slice(0, 10).map(u => (
                                  <div key={u.id} className="text-xs flex items-center justify-between gap-2">
                                    <span className="text-gray-300 truncate">{u.title_syllabus}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.status === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-400' : u.status === 'PURGED' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>{u.status}</span>
                                  </div>
                                ))}
                                {selectedUserUploads.length > 10 && <p className="text-xs text-gray-500">+{selectedUserUploads.length - 10} more</p>}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            Joined {new Date(selectedUser.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>

                          {/* Admin Delete */}
                          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4">
                            <h4 className="text-sm font-bold text-red-400 mb-1">Danger Zone</h4>
                            <p className="text-xs text-gray-400 mb-3">Delete this user account. Their uploads will remain as “Deleted User” (anonymous).</p>
                            <div className="flex gap-2 mb-3">
                              <input
                                type="text"
                                placeholder="Type DELETE to confirm"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 font-mono"
                              />
                              <button
                                onClick={handleAdminDeleteUser}
                                disabled={deleteConfirmText !== 'DELETE' || deletingUser || selectedUser.role === 'SUPER_ADMIN'}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all flex items-center gap-2"
                              >
                                {deletingUser ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                                Delete User
                              </button>
                            </div>
                            {selectedUser.role === 'SUPER_ADMIN' && <p className="text-xs text-amber-400">Cannot delete another admin.</p>}
                          </div>
                        </div>
                        <div className="px-6 py-3 border-t border-white/10 flex justify-end">
                          <button onClick={() => { setSelectedUser(null); setSelectedUserUploads([]); setDeleteConfirmText(''); }} className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-300 text-sm font-medium rounded-xl border border-white/10">Close</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* CURRICULUM TAB */}
              {activeTab === 'CURRICULUM' && (
                <div className="space-y-8">
                  {/* Branches Section */}
                  <section>
                    <h2 className="text-xl font-bold text-white mb-4">Manage Branches</h2>
                    <form onSubmit={addBranch} className="flex gap-3 mb-4">
                      <input type="text" placeholder="Code (e.g. CSE)" value={newBranchCode} onChange={e => setNewBranchCode(e.target.value)} required className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm w-32 focus:border-amber-400 outline-none" />
                      <input type="text" placeholder="Full Name" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} required className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm flex-1 focus:border-amber-400 outline-none" />
                      <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Branch</button>
                    </form>
                    
                    <div className="bg-white/10 border border-white/15 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <tbody className="divide-y divide-white/5">
                          {branches.map(b => (
                            <tr key={b.id} className="hover:bg-white/5">
                              <td className="py-3 px-4 font-medium text-amber-400 w-24">{b.branch_code}</td>
                              <td className="py-3 px-4 text-gray-300">{b.branch_name}</td>
                              <td className="py-3 px-4 text-right">
                                <button onClick={() => deleteBranch(b.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Subjects Section */}
                  <section>
                    <h2 className="text-xl font-bold text-white mb-4">Manage Subjects</h2>
                    <form onSubmit={addSubject} className="flex flex-wrap gap-3 mb-4">
                      <select value={newSubBranchId} onChange={e => setNewSubBranchId(e.target.value)} className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm focus:border-amber-400 outline-none">
                        {branches.map(b => <option key={b.id} value={b.id} className="bg-gray-900 text-white">{b.branch_code}</option>)}
                      </select>
                      <select value={newSubSem} onChange={e => setNewSubSem(e.target.value)} className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm focus:border-amber-400 outline-none">
                        {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s} className="bg-gray-900 text-white">Sem {s}</option>)}
                      </select>
                      <input type="text" placeholder="Code (e.g. CS101)" value={newSubCode} onChange={e => setNewSubCode(e.target.value)} required className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm w-36 focus:border-amber-400 outline-none" />
                      <input type="text" placeholder="Subject Name" value={newSubName} onChange={e => setNewSubName(e.target.value)} required className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm flex-1 focus:border-amber-400 outline-none" />
                      <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Subject</button>
                    </form>

                    <div className="bg-white/10 border border-white/15 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <tbody className="divide-y divide-white/5">
                          {subjects.map(s => {
                            const b = branches.find(br => br.id === s.branch_id);
                            return (
                              <tr key={s.id} className="hover:bg-white/5">
                                <td className="py-2 px-4 text-gray-400 w-20">{b?.branch_code}</td>
                                <td className="py-2 px-4 text-gray-400 w-16">S{s.semester}</td>
                                <td className="py-2 px-4 font-medium text-blue-400 w-28">{s.subject_code}</td>
                                <td className="py-2 px-4 text-gray-300">{s.subject_name}</td>
                                <td className="py-2 px-4 text-right">
                                  <button onClick={() => deleteSubject(s.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* FLAGGED USERS TAB */}
              {activeTab === 'FLAGGED' && (
                <div>
                  {selectedFlaggedUser ? (
                    <div>
                      <button onClick={() => { setSelectedFlaggedUser(null); setFlaggedUserUploads([]); }}
                        className="text-sm text-amber-400 hover:text-amber-300 mb-4 inline-flex items-center gap-1">
                        ← Back to flagged users
                      </button>
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-bold text-white">{selectedFlaggedUser.full_name}</h2>
                          <p className="text-sm text-gray-400">{selectedFlaggedUser.email}</p>
                          <div className="flex gap-2 mt-2">
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                              {selectedFlaggedUser.report_count} reports
                            </span>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${selectedFlaggedUser.is_banned ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'}`}>
                              {selectedFlaggedUser.is_banned ? 'Banned' : 'Active'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!selectedFlaggedUser.is_banned && (
                            <button onClick={() => handleBanUser(selectedFlaggedUser.id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-all">
                              Ban User
                            </button>
                          )}
                          <button onClick={() => handleDismissUser(selectedFlaggedUser.id)}
                            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-gray-300 text-sm font-medium rounded-xl border border-white/10 transition-all">
                            Dismiss
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">All Uploads by this User</h3>
                      {loadingFlaggedUploads ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500"></div>
                        </div>
                      ) : flaggedUserUploads.length === 0 ? (
                        <p className="text-gray-400 text-sm py-4">No uploads found.</p>
                      ) : (
                        <div className="space-y-3">
                          {flaggedUserUploads.map(u => (
                            <div key={u.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-white">{u.title_syllabus}</span>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      u.status === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' :
                                      u.status === 'PURGED' ? 'bg-red-500/15 text-red-400 border border-red-500/25' :
                                      'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                    }`}>{u.status}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-400">
                                    <span>{u.category}</span>
                                    {u.subject_code && <span>· {u.subject_code}</span>}
                                    <span>· {new Date(u.created_at).toLocaleDateString()}</span>
                                    {u.file_url && (
                                      <a href={u.file_url} target="_blank" rel="noopener noreferrer"
                                        className="text-indigo-400 hover:text-indigo-300 underline">View file</a>
                                    )}
                                  </div>
                                </div>
                                {u.report_count > 0 && (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 shrink-0">
                                    {u.report_count} report{u.report_count > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {u.report_reasons && u.report_reasons.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Report Reasons</p>
                                  <div className="space-y-1.5">
                                    {u.report_reasons.map((r, i) => (
                                      <div key={i} className="flex items-start gap-2 text-sm">
                                        <span className="text-red-400 mt-0.5">•</span>
                                        <div>
                                          <span className="text-white">{r.reason || 'No reason provided'}</span>
                                          <span className="text-gray-500 ml-2">— {r.reporter_name}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-4">⚠️ Flagged Users</h2>
                      <p className="text-sm text-gray-400 mb-4">Users reported by the community for spam or inappropriate content.</p>
                      {flaggedUsers.length === 0 ? (
                        <p className="text-gray-400 text-sm py-8 text-center">No flagged users — all clear!</p>
                      ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-gray-500 border-b border-white/10">
                              <th className="pb-3 font-medium">User</th>
                              <th className="pb-3 font-medium">Semester</th>
                              <th className="pb-3 font-medium">Reports</th>
                              <th className="pb-3 font-medium">Status</th>
                              <th className="pb-3 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {flaggedUsers.map(fu => (
                              <tr key={fu.id} className="hover:bg-white/5 cursor-pointer" onClick={() => {
                                setSelectedFlaggedUser(fu);
                                fetchFlaggedUserUploads(fu.user_id);
                              }}>
                                <td className="py-4">
                                  <div className="font-medium text-white">{fu.full_name}</div>
                                  <div className="text-xs text-gray-400">{fu.email}</div>
                                </td>
                                <td className="py-4 text-gray-400">Sem {fu.semester}</td>
                                <td className="py-4">
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                                    {fu.report_count}
                                  </span>
                                </td>
                                <td className="py-4">
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${fu.is_banned || fu.status === 'banned' ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'}`}>
                                    {fu.is_banned || fu.status === 'banned' ? 'Banned' : fu.status}
                                  </span>
                                </td>
                                <td className="py-4 text-right space-x-3">
                                  {!fu.is_banned && fu.status !== 'banned' && (
                                    <button onClick={(e) => { e.stopPropagation(); handleBanUser(fu.id); }}
                                      className="text-red-400 hover:text-red-300 text-xs font-medium">Ban</button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); handleDismissUser(fu.id); }}
                                    className="text-gray-400 hover:text-gray-300 text-xs font-medium">Dismiss</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
