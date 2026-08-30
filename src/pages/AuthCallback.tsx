import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      try {
        // 1. Check for OAuth errors from Supabase/Google
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const oauthError = params.get('error') || hashParams.get('error');
        const oauthErrorDesc = params.get('error_description') || hashParams.get('error_description');

        if (oauthError) {
          console.error('OAuth Provider Error:', oauthError, oauthErrorDesc);
          navigate(`/login?error=${encodeURIComponent(oauthErrorDesc || oauthError)}`);
          return;
        }

        // 2. Handle PKCE flow (?code=...)
        const code = params.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // 2. Wait for session (handles both PKCE completion and Implicit Hash flow)
        // Supabase processes the URL hash asynchronously. If we call getSession() 
        // too early, it might return null. So we check up to 10 times (2 seconds max).
        let currentSession = null;
        for (let i = 0; i < 10; i++) {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (session?.user) {
            currentSession = session;
            break;
          }
          // wait 200ms before checking again
          await new Promise(r => setTimeout(r, 200));
        }

        if (!currentSession?.user) {
          console.error('AuthCallback: No session found after waiting.');
          navigate('/login?error=no_session');
          return;
        }

        // 3. Small delay to let DB trigger create the user row
        await new Promise(r => setTimeout(r, 800));

        // 4. Check profile and route accordingly
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_completed, role')
          .eq('auth_id', currentSession.user.id)
          .single();

        if (profile?.role === 'SUPER_ADMIN') {
          navigate('/admin/dashboard');
          return;
        }

        if (!profile) {
          // No matching profile — auth was wiped (orphan/branch deleted) or stale cache.
          // Spec: sign out locally and redirect to login/onboarding, never render blank dashboard.
          await supabase.auth.signOut();
          Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
          navigate('/auth/student');
          return;
        }

        if (!profile.onboarding_completed) {
          // Standard onboarding — never auto-send to set-password here.
          // set-password is ONLY for PASSWORD_RECOVERY / type=recovery.
          navigate('/auth/student-onboarding');
          return;
        }

        navigate('/dashboard');

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Auth callback error:', msg);
        navigate('/login?error=oauth_failed');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-900 relative z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Completing sign in...</p>
        <p className="text-gray-400 text-xs">Please wait, setting up your account</p>
      </div>
    </div>
  );
}
