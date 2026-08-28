import { useNavigate } from 'react-router-dom';
import { Compass, Home, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function NotFound() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAuthed = Boolean(session);

  return (
    <div className="min-h-screen bg-[#09090b] relative flex items-center justify-center p-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[70vw] h-[50vw] rounded-full bg-indigo-600/8 blur-[120px]" />
      </div>
      <div className="relative glass-strong rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
          <Compass className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-5xl font-black tracking-tight text-white">404</h1>
        <p className="text-lg font-bold text-white mt-1">Page not found</p>
        <p className="text-sm text-gray-400 mt-2">The page you’re looking for doesn’t exist or was moved.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(isAuthed ? '/dashboard' : '/')}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
          >
            {isAuthed ? <LayoutDashboard className="w-4 h-4" /> : <Home className="w-4 h-4" />}
            {isAuthed ? 'Go to Dashboard' : 'Go Home'}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold rounded-xl transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
