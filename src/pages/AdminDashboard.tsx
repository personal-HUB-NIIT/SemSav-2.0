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
  users: { full_name: string; email: string }[] | null;
  subjects: { subject_code: string; subject_name: string }[] | null;
}

interface User {
  id: string;
  full_name: string;
  email: string;
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
          .select('id, full_name, email, role, karma_points, created_at, branches(branch_code)')
          .order('created_at', { ascending: false });
        setUsers(data || []);
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
                          <td className="py-4 text-gray-400">{u.subjects?.[0]?.subject_code ?? '—'}</td>
                           <td className="py-4 text-gray-400">{u.users?.[0]?.full_name ?? '—'}</td>
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
              {activeTab === 'USERS' && (
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">User Directory</h2>
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/10">
                        <th className="pb-3 font-medium">Name</th>
                        <th className="pb-3 font-medium">Email</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium">Branch</th>
                        <th className="pb-3 font-medium">Karma</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-white/5">
                          <td className="py-4 font-medium text-white">{u.full_name}</td>
                          <td className="py-4 text-gray-400">{u.email}</td>
                          <td className="py-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${u.role === 'SUPER_ADMIN' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-gray-300'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4 text-gray-400">{u.branches?.[0]?.branch_code ?? 'N/A'}</td>
                          <td className="py-4 text-amber-400 font-medium">{u.karma_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
