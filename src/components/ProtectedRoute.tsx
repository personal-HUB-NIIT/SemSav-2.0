import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in at all → redirect to login
  if (!session) {
    const loginPath = requireAdmin ? '/admin/login' : '/auth/student';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Wiped / orphaned account — auth exists but no profile row (branch deleted + delete_branch_users wiped auth)
  // Treat as new user: force onboarding instead of rendering dashboard with stale null profile.
  // Exempt the onboarding/auth pages themselves to avoid redirect loop.
  if (!requireAdmin && !profile) {
    const allowed = ['/auth/student-onboarding', '/auth/callback'];
    // set-password is ONLY for PASSWORD_RECOVERY; do not treat missing profile as onboarding there
    if (!allowed.includes(location.pathname) && location.pathname !== '/auth/set-password') {
      return <Navigate to="/auth/student-onboarding" replace />;
    }
  }

  // Guard: /auth/set-password must ONLY render on PASSWORD_RECOVERY / type=recovery
  if (location.pathname === '/auth/set-password') {
    const hash = window.location.hash || '';
    const isRecovery = hash.includes('type=recovery');
    if (!isRecovery) {
      // No recovery context — send to home instead of showing set-password
      return <Navigate to="/" replace />;
    }
  }

  // Admin route but user is not admin
  if (requireAdmin && profile?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Student route but user is admin → send to admin dashboard
  if (!requireAdmin && profile?.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Onboarding not completed → redirect to onboarding (never to set-password unless recovery)
  if (!requireAdmin && profile && !profile.onboarding_completed) {
    if (location.pathname !== '/auth/student-onboarding' && location.pathname !== '/auth/set-password') {
      return <Navigate to="/auth/student-onboarding" replace />;
    }
  }

  return <>{children}</>;
}
