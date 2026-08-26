import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface Branch { id: string; branch_name: string; branch_code: string; }

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const TOTAL_STEPS = 2;

export default function Onboarding() {
  const { user, profile, fetchProfile } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form state
  const [fullName, setFullName]         = useState(profile?.full_name || '');
  const [branchId, setBranchId]         = useState('');
  const [semester, setSemester]         = useState<number>(1);
  const [enrollmentId, setEnrollmentId] = useState('');

  useEffect(() => {
    supabase.from('branches').select('id, branch_name, branch_code').order('branch_name')
      .then(({ data }) => { if (data) setBranches(data); });
  }, []);

  useEffect(() => {
    if (user?.user_metadata?.full_name && !fullName) {
      setFullName(user.user_metadata.full_name);
    }
  }, [user, fullName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) { toast.error('Please enter your name'); return; }
    if (!branchId) { toast.error('Please select your branch'); return; }
    setLoading(true);

    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName.trim(),
        branch_id: branchId,
        semester,
        enrollment_id: enrollmentId || null,
        onboarding_completed: true,
      })
      .eq('auth_id', user.id);

    setLoading(false);
    if (error) { toast.error('Failed to save profile: ' + error.message); return; }

    // Refresh profile so ProtectedRoute sees onboarding_completed=true
    await fetchProfile(user.id);
    toast.success('Profile complete! Welcome to SemSav');
    // Hard redirect to ensure fresh profile load and avoid stale context race
    window.location.href = '/dashboard';
  };

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-emerald-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl mb-4">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Set Up Your Profile</h1>
          <p className="text-slate-400 text-sm mt-1">Just a few details to personalize your experience</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit}>

            {/* Step 1: Personal Info */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Personal Information</h2>
                  <p className="text-slate-400 text-sm">Tell us who you are</p>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Full Name</label>
                  <input
                    type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Enrollment ID <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text" value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)}
                    placeholder="e.g. 24BCSE001"
                    className="w-full bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <button
                  type="button" onClick={() => { if (!fullName.trim()) { toast.error('Please enter your name'); return; } setStep(2); }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all"
                >
                  Continue →
                </button>
              </div>
            )}

            {/* Step 2: Academic Info (Final) */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Academic Details</h2>
                  <p className="text-slate-400 text-sm">Help us show you relevant content</p>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Branch / Department</label>
                  <select
                    value={branchId} onChange={e => setBranchId(e.target.value)} required
                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  >
                    <option value="" className="bg-slate-800">Select your branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-slate-800">{b.branch_name} ({b.branch_code})</option>
                    ))}
                    {branches.length === 0 && (
                      <option disabled className="bg-slate-800">Loading branches...</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Current Semester</label>
                  <div className="grid grid-cols-4 gap-2">
                    {SEMESTERS.map(s => (
                      <button
                        key={s} type="button" onClick={() => setSemester(s)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 ${
                          semester === s
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-all">
                    ← Back
                  </button>
                  <button
                    type="submit" disabled={loading || !branchId}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                    {loading ? 'Saving...' : 'Complete Setup'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
