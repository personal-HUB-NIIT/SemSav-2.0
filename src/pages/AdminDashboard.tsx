import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-amber-600/20 border border-amber-600/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">🛡️</span>
        </div>
        <p className="text-amber-500 text-xs uppercase tracking-widest font-medium mb-2">Super Admin</p>
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-slate-400 mb-2">{profile?.full_name}</p>
        <p className="text-slate-500 text-sm mb-8">Admin Panel — Coming Soon 🚀</p>
        <button onClick={handleSignOut}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-xl text-sm transition-all">
          Sign Out
        </button>
      </div>
    </div>
  );
}
