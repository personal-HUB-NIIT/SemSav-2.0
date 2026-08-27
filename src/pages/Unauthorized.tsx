import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-red-600/10 rounded-full blur-3xl" />
      </div>
      <div className="text-center z-10">
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 text-sm mb-8">You don't have permission to view this page.</p>
        <Link to="/login" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm transition-all">
          Back to Login
        </Link>
      </div>
    </div>
  );
}