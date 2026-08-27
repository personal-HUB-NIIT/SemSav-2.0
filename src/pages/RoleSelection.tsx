import { Link } from 'react-router-dom';

export default function RoleSelection() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md text-center">
        {/* Logo / Brand */}
        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/30">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SemSav 2.0</h1>
          <p className="text-gray-400 text-base mt-2">Welcome! Please select your role to continue.</p>
        </div>

        {/* Selection Cards */}
        <div className="space-y-4">
          <Link
            to="/auth/student"
            className="group block bg-slate-800/60 hover:bg-indigo-600/20 backdrop-blur-xl border border-slate-700/50 hover:border-indigo-500/50 rounded-2xl p-6 shadow-xl transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-indigo-600">ST</span>
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">I'm a Student</h3>
                  <p className="text-sm text-gray-400">Access notes, assignments & tests</p>
                </div>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          <Link
            to="/admin/login"
            className="group block bg-slate-800/60 hover:bg-emerald-600/20 backdrop-blur-xl border border-slate-700/50 hover:border-emerald-500/50 rounded-2xl p-6 shadow-xl transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-purple-600">AD</span>
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors">I'm Admin / Owner</h3>
                  <p className="text-sm text-gray-400">Manage content & users</p>
                </div>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
