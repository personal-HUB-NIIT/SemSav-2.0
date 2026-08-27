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
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const oauthError = params.get('error') || hashParams.get('error');
        const oauthErrorDesc = params.get('error_description') || hashParams.get('error_description');

        if (oauthError) {
          console.error('OAuth Provider Error:', oauthError, oauthErrorDesc);
          navigate(`/login?error=${encodeURIComponent(oauthErrorDesc || oauthError)}`);
          return;
        }

        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        let currentSession = null;
        for (let i = 0; i < 10; i++) {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (session?.user) {
            currentSession = session;
            break;
          }
          await new Promise(r => setTimeout(r, 200));
        }

        if (!currentSession?.user) {
          console.error('AuthCallback: No session found after waiting.');
          navigate('/login?error=no_session');
          return;
        }

        await new Promise(r => setTimeout(r, 800));

        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_completed, role')
          .eq('auth_id', currentSession.user.id)
          .single();

        if (profile?.role === 'SUPER_ADMIN') {
          navigate('/admin/dashboard');
          return;
        }

        if (!profile || !profile.onboarding_completed) {
          if (!currentSession.user.user_metadata?.password_setup_complete) {
            navigate('/auth/set-password');
          } else {
            navigate('/auth/student-onboarding');
          }
          return;
        }

        navigate('/dashboard');

      } catch (err: any) {
        console.error('Auth callback error:', err.message);
        navigate('/login?error=oauth_failed');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Completing sign in...</p>
        <p className="text-gray-600 text-xs">Please wait, setting up your account</p>
      </div>
    </div>
  );
}