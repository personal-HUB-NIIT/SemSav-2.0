import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">📚</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {profile?.full_name?.split(' ')[0]}!</h1>
        <p className="text-slate-400 mb-2">Karma: <span className="text-emerald-400 font-semibold">{profile?.karma_points ?? 0} pts</span></p>
        <p className="text-slate-500 text-sm mb-8">Student Dashboard — Coming Soon 🚀</p>
        <button onClick={handleSignOut}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all">
          Sign Out
        </button>
      </div>
    </div>
  );
}
