import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface UserProfile {
  id: string;
  auth_id: string;
  enrollment_id: string | null;
  full_name: string;
  email: string;
  branch_id: string | null;
  semester: number | null;
  karma_points: number;
  role: 'STUDENT' | 'SUPER_ADMIN';
  is_verified: boolean;
  is_banned: boolean;
  onboarding_completed: boolean;
  avatar_url: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  const fetchProfile = async (authId: string): Promise<UserProfile | null> => {
    // Try with avatar_url first; fall back if column doesn't exist yet (migration pending)
    let { data, error } = await supabase
      .from('users')
      .select('id, auth_id, enrollment_id, full_name, email, branch_id, semester, karma_points, role, is_verified, is_banned, onboarding_completed, avatar_url')
      .eq('auth_id', authId)
      .maybeSingle();

    if (error && (error.message?.includes('avatar_url') || error.code === '42703')) {
      const fallback = await supabase
        .from('users')
        .select('id, auth_id, enrollment_id, full_name, email, branch_id, semester, karma_points, role, is_verified, is_banned, onboarding_completed')
        .eq('auth_id', authId)
        .maybeSingle();
      data = { ...fallback.data, avatar_url: null } as typeof data;
      error = fallback.error;
    }

    if (error) return null;
    if (!data) return null;
    const fresh = { ...data, avatar_url: (data as Record<string, unknown>).avatar_url ?? null } as UserProfile;
    // Keep global state in sync so consumers re-render with fresh profile data
    setState(prev => (prev.user ? { ...prev, profile: fresh } : prev));
    return fresh;
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setState({ session, user: session.user, profile, loading: false });
      } else {
        setState({ session: null, user: null, profile: null, loading: false });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setState({ session, user: session.user, profile, loading: false });
      } else {
        setState({ session: null, user: null, profile: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut, fetchProfile };
}
