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

    await fetchProfile(user.id);
    toast.success('Profile complete! Welcome to SemSav');
    window.location.href = '/dashboard';
  };

  const progress = (step / TOTAL_STEPS) * 100;

  const inputClass = 'w-full bg-white/10 border border-white/15 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 transition-all';
  const selectClass = 'w-full bg-white/10 border border-white/15 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 transition-all appearance-none cursor-pointer';

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-emerald-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl mb-4">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Set Up Your Profile</h1>
          <p className="text-gray-400 text-sm mt-1">Just a few details to personalize your experience</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="glass-strong rounded-2xl p-8 shadow-2xl border border-white/10">
          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Personal Information</h2>
                  <p className="text-gray-400 text-sm">Tell us who you are</p>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-1.5">Full Name</label>
                  <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter your full name" className={inputClass} />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-1.5">Enrollment ID <span className="text-gray-600">(optional)</span></label>
                  <input type="text" value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)} placeholder="e.g. 24BCSE001" className={inputClass} />
                </div>
                <button type="button" onClick={() => { if (!fullName.trim()) { toast.error('Please enter your name'); return; } setStep(2); }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all">
                  Continue →
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">Academic Details</h2>
                  <p className="text-gray-400 text-sm">Help us show you relevant content</p>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-1.5">Branch / Department</label>
                  <select value={branchId} onChange={e => setBranchId(e.target.value)} required className={selectClass}>
                    <option value="" className="bg-gray-900 text-white">Select your branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-gray-900 text-white">{b.branch_name} ({b.branch_code})</option>
                    ))}
                    {branches.length === 0 && <option disabled className="bg-gray-900 text-white">Loading branches...</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-1.5">Current Semester</label>
                  <div className="grid grid-cols-4 gap-2">
                    {SEMESTERS.map(s => (
                      <button key={s} type="button" onClick={() => setSemester(s)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 ${
                          semester === s
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-white/5 border-white/15 text-gray-400 hover:border-white/25 hover:text-white'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all border border-white/10">
                    ← Back
                  </button>
                  <button type="submit" disabled={loading || !branchId}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
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