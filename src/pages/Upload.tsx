import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { FileText, ClipboardList, CalendarDays, Sparkles, Rocket } from 'lucide-react';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  is_lab: boolean;
}

type Category = 'NOTES' | 'ASSIGNMENT' | 'TEST';
type TestType = 'MID_SEM' | 'QUIZ' | 'LAB_TEST' | 'VIVA' | 'RESCHEDULED';

const CATEGORIES: { value: Category; label: string; Icon: typeof FileText; desc: string }[] = [
  { value: 'NOTES',      label: 'Notes',      Icon: FileText,      desc: 'Lecture notes, handouts' },
  { value: 'ASSIGNMENT', label: 'Assignment',  Icon: ClipboardList, desc: 'Homework, projects with deadline' },
  { value: 'TEST',       label: 'Test / Exam', Icon: CalendarDays,  desc: 'Exam schedule, room & syllabus' },
];

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'MID_SEM',     label: 'Mid Semester' },
  { value: 'QUIZ',        label: 'Quiz' },
  { value: 'LAB_TEST',    label: 'Lab Test' },
  { value: 'VIVA',        label: 'Viva / Oral' },
  { value: 'RESCHEDULED', label: 'Rescheduled' },
];

export default function Upload() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Form state
  const [category, setCategory]       = useState<Category>('NOTES');
  const [subjectId, setSubjectId]     = useState('');
  const [title, setTitle]             = useState('');
  const [testType, setTestType]       = useState<TestType | ''>('');
  const [dueDateTime, setDueDateTime] = useState('');
  const [roomNo, setRoomNo]           = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    supabase
      .from('subjects')
      .select('id, subject_name, subject_code, is_lab')
      .eq('branch_id', profile.branch_id)
      .eq('semester', profile.semester)
      .order('subject_name')
      .then(({ data }) => {
        if (data) setSubjects(data);
      });
  }, [profile]);

  const handleFile = (file: File) => {
    const maxSize = 20 * 1024 * 1024; // 20 MB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 20 MB.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleAiExtract = async () => {
    if (!selectedFile) return;
    setAiExtracting(true);
    const loadingToast = toast.loading('AI is reading your file...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append('file', selectedFile);

      // Call local Node.js Server
      const res = await fetch('http://127.0.0.1:3001/api/ai-extract', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract data');

      if (data.title) setTitle(data.title);
      if (data.test_type) {
        setCategory('TEST');
        setTestType(data.test_type);
      }
      if (data.room_no) setRoomNo(data.room_no);
      if (data.due_date_time) setDueDateTime(data.due_date_time);

      toast.success('Fields auto-filled successfully!', { id: loadingToast });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    } finally {
      setAiExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!subjectId) { toast.error('Please select a subject'); return; }
    if (!title.trim()) { toast.error('Please enter a title'); return; }
    if (category === 'TEST' && !testType) { toast.error('Please select test type'); return; }
    if (category === 'TEST' && !dueDateTime) { toast.error('Please enter exam date & time'); return; }
    if (category === 'ASSIGNMENT' && !dueDateTime) { toast.error('Please enter submission deadline'); return; }
    if (category === 'NOTES' && !selectedFile) { toast.error('Please attach a file for notes'); return; }

    setLoading(true);
    try {
      // 1. Upload file to Supabase Storage (required for NOTES, optional for ASSIGNMENT/TEST)
      let publicUrl: string | null = null;
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop();
        const filePath = `uploads/${user.id}/${Date.now()}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from('semsav-files')
          .upload(filePath, selectedFile, { upsert: false });

        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage
          .from('semsav-files')
          .getPublicUrl(filePath);
        publicUrl = urlData.publicUrl;
      }

      // 2. Insert record into uploads table
      const { error: dbError } = await supabase.from('uploads').insert({
        user_id:        profile.id,
        branch_id:      profile.branch_id,
        semester:       profile.semester,
        subject_id:     subjectId,
        category,
        title_syllabus: title,
        test_type:      category === 'TEST' ? testType : null,
        due_date_time:  (category === 'TEST' || category === 'ASSIGNMENT') ? dueDateTime : null,
        room_no:        category === 'TEST' ? roomNo || null : null,
        file_url:       publicUrl,
        status:         'UNVERIFIED',
      });

      if (dbError) throw dbError;

      toast.success('Upload successful! It will appear once verified.');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">Upload Content</h1>
            <p className="text-gray-400 text-xs">Share notes, assignments & exam schedules</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Category Selector */}
          <div className="glass border border-white/10 rounded-2xl p-6">
            <label className="block text-white font-semibold mb-4">What are you uploading?</label>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    category === cat.value
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <cat.Icon className="w-6 h-6" />
                  <span className="text-sm font-medium">{cat.label}</span>
                  <span className="text-xs text-center opacity-70">{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject & Title */}
          <div className="glass border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">Subject</label>
              <select
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
                className="w-full bg-white/10 border border-white/15 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30/50 transition-all"
              >
                <option value="" className="bg-slate-800">Select subject...</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-800">
                    {s.subject_name} ({s.subject_code}){s.is_lab ? ' — Lab' : ''}
                  </option>
                ))}
                {subjects.length === 0 && (
                  <option disabled className="bg-slate-800">No subjects found for your branch/semester</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5">
                {category === 'NOTES' ? 'Title / Topic' : category === 'ASSIGNMENT' ? 'Assignment Title' : 'Syllabus / Topics Covered'}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={
                  category === 'NOTES' ? 'e.g. Unit 3 — Tree Traversals' :
                  category === 'ASSIGNMENT' ? 'e.g. Assignment 2 — Sorting Algorithms' :
                  'e.g. Unit 1–3, excluding Chapter 5'
                }
                className="w-full bg-slate-900/60 border border-slate-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30/50 transition-all"
              />
            </div>
          </div>

          {/* Assignment / Test specific fields */}
          {(category === 'ASSIGNMENT' || category === 'TEST') && (
            <div className="glass border border-white/10 rounded-2xl p-6 space-y-4">
              {category === 'TEST' && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">Test Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TEST_TYPES.map(tt => (
                      <button
                        key={tt.value}
                        type="button"
                        onClick={() => setTestType(tt.value)}
                        className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                          testType === tt.value
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {tt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1.5">
                  {category === 'ASSIGNMENT' ? 'Submission Deadline' : 'Exam Date & Time'}
                </label>
                <input
                  type="datetime-local"
                  value={dueDateTime}
                  onChange={e => setDueDateTime(e.target.value)}
                  className="w-full bg-white/10 border border-white/15 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30/50 transition-all [color-scheme:dark]"
                />
              </div>

              {category === 'TEST' && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1.5">
                    Room No. <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={roomNo}
                    onChange={e => setRoomNo(e.target.value)}
                    placeholder="e.g. A-201, Main Hall"
                    className="w-full bg-slate-900/60 border border-slate-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30/50 transition-all"
                  />
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          <div className="glass border border-white/10 rounded-2xl p-6">
            <label className="block text-gray-300 text-sm font-medium mb-3">
              Attach File {category === 'NOTES' ? <span className="text-red-400">*</span> : <span className="text-gray-400">(optional)</span>}
            </label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : selectedFile
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : 'border-slate-700 hover:border-white/20 hover:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
              {selectedFile ? (
                <div className="space-y-2">
                  
                  <p className="text-white font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-gray-400 text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                      className="text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/20 transition-colors"
                    >
                      Remove file
                    </button>
                    <button
                      type="button"
                      disabled={aiExtracting}
                      onClick={e => { e.stopPropagation(); handleAiExtract(); }}
                      className="text-indigo-400 hover:text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-400/10 hover:bg-indigo-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {aiExtracting ? (
                        <>
                          <div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Auto-Fill with AI</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  
                  <p className="text-gray-400 text-sm font-medium">Drop your file here or click to browse</p>
                  <p className="text-gray-400 text-xs">PDF, Word, PPT, Images, ZIP — max 20 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Uploading...
              </>
            ) : <span className='inline-flex items-center gap-2'><Rocket className='w-4 h-4' /> Submit Upload</span>}
          </button>

          <p className="text-center text-gray-400 text-xs">
            Your upload will be visible to others once it receives enough upvotes (verified by peers).
          </p>
        </form>
      </div>
    </div>
  );
}
