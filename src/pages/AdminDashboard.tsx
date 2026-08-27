import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

type Tab = 'UPLOADS' | 'USERS' | 'CURRICULUM';

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

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<Tab>('UPLOADS');
  const [loading, setLoading] = useState(true);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

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
    <div className="min-h-screen bg-[var(--bg)] text-white flex flex-col">
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
          {['UPLOADS', 'USERS', 'CURRICULUM'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as Tab)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab 
                  ? 'bg-amber-600/10 text-amber-400 border border-amber-600/30' 
                  : 'hover:bg-white/10 text-gray-400 border border-white/10'
              }`}
            >
              {tab === 'UPLOADS' && 'Manage Uploads'}
              {tab === 'USERS' && 'User Directory'}
              {tab === 'CURRICULUM' && 'Curriculum (Branches)'}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
