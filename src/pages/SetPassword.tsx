import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

export default function SetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  
  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Fetch the currently authenticated user's email
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { 
      toast.error('Passwords do not match'); 
      return; 
    }
    if (password.length < 6) { 
      toast.error('Password must be at least 6 characters'); 
      return; 
    }
    
    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
      data: { password_setup_complete: true }
    });
    
    setLoading(false);

    if (error) { 
      toast.error(error.message); 
      return; 
    }
    
    toast.success('Password set successfully!');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-900 relative z-10 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Set Your Password</h1>
          <p className="text-gray-400 text-sm mt-1">Please secure your account with a password.</p>
        </div>

        {/* Card */}
        <div className="glass-strong border border-white/10 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">Email Address</label>
              <input
                type="email" 
                value={email} 
                readOnly
                disabled
                className="w-full bg-white/5 border border-white/10 text-gray-400 rounded-xl px-4 py-3 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">New Password</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full bg-white/5 border border-white/15 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">Confirm Password</label>
              <input
                type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/15 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 transition-all"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {loading ? 'Saving...' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
