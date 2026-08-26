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

  // Admin route but user is not admin
  if (requireAdmin && profile?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Student route but user is admin → send to admin dashboard
  if (!requireAdmin && profile?.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Onboarding not completed → redirect to onboarding
  if (!requireAdmin && profile && !profile.onboarding_completed) {
    const isPasswordSet = session.user.user_metadata?.password_setup_complete;
    
    if (!isPasswordSet) {
      if (location.pathname !== '/auth/set-password') {
        return <Navigate to="/auth/set-password" replace />;
      }
    } else {
      if (location.pathname !== '/auth/student-onboarding') {
        return <Navigate to="/auth/student-onboarding" replace />;
      }
    }
  }

  // Profile not found in users table (auth exists but profile row missing) → send to onboarding
  if (!requireAdmin && !profile && session) {
    if (location.pathname !== '/auth/student-onboarding') {
      return <Navigate to="/auth/student-onboarding" replace />;
    }
  }

  return <>{children}</>;
}
