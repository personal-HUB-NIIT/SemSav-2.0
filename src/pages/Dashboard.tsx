import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AcademicTask {
  id: string;
  user_id: string;
  title: string;
  subject_code?: string;
  event_type: 'test' | 'assignment' | 'exam' | 'task';
  due_date: string;
  is_completed: boolean;
  description?: string;
}

interface ClassSlot {
  id: string;
  branch_id: string;
  semester: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject_name: string;
  subject_code: string;
  teacher_name: string | null;
  room_number: string | null;
}

interface FeedUpload {
  id: string;
  title_syllabus: string;
  category: string;
  created_at: string;
  users?: { full_name: string } | { full_name: string }[] | null;
  subjects?: { subject_name: string; subject_code: string } | { subject_name: string; subject_code: string }[] | null;
}

type FilterType = 'all' | 'test' | 'assignment' | 'task';

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<AcademicTask['event_type'], {
  bg: string; border: string; text: string; dot: string; label: string; icon: string;
}> = {
  test:       { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#ef4444', label: 'Test',       icon: '📝' },
  exam:       { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', dot: '#a855f7', label: 'Exam',       icon: '🎓' },
  assignment: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b', label: 'Assignment', icon: '📋' },
  task:       { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', dot: '#3b82f6', label: 'Task',       icon: '✅' },
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const UPLOAD_META: Record<string, { label: string; icon: string; chip: string }> = {
  NOTES:      { label: 'Notes',      icon: '📝', chip: 'bg-blue-50 border-blue-200 text-blue-700' },
  TEST:       { label: 'PYQ',        icon: '📄', chip: 'bg-red-50 border-red-200 text-red-700' },
  ASSIGNMENT: { label: 'Assignment', icon: '📋', chip: 'bg-amber-50 border-amber-200 text-amber-700' },
};
const FALLBACK_UPLOAD_META = { label: 'File', icon: '📁', chip: 'bg-slate-100 border-slate-200 text-slate-600' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isoToDateKey(iso: string): string { return toLocalDateKey(new Date(iso)); }

function startOfTodayMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
function daysAgo(iso: string): number { return (Date.now() - new Date(iso).getTime()) / 86400000; }

function formatDisplayTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTime12(t: string): string {
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function dueTag(iso: string): { label: string; tone: 'overdue' | 'urgent' | 'soon' | 'calm' } {
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue   = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86400000);
  if (days < 0)   return { label: 'Overdue',             tone: 'overdue' };
  if (days === 0) return { label: 'Due today',           tone: 'urgent' };
  if (days === 1) return { label: 'Due tomorrow',        tone: 'urgent' };
  if (days <= 3)  return { label: `Due in ${days} days`, tone: 'soon' };
  return { label: `Due in ${days} days`, tone: 'calm' };
}

const DUE_TAG_STYLES: Record<ReturnType<typeof dueTag>['tone'], string> = {
  overdue: 'bg-red-100 text-red-700',
  urgent:  'bg-orange-100 text-orange-700',
  soon:    'bg-indigo-100 text-indigo-700',
  calm:    'bg-slate-100 text-slate-600',
};

function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const endPad   = 6 - lastDay.getDay();
  const cells: Date[] = [];
  for (let i = startPad - 1; i >= 0; i--) cells.push(new Date(year, month, -i));
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  for (let i = 1; i <= endPad; i++) cells.push(new Date(year, month + 1, i));
  while (cells.length < 42)
    cells.push(new Date(year, month + 1, cells.length - lastDay.getDate() - startPad + 1));
  return cells;
}

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function isTableMissing(err: { message?: string; code?: string }): boolean {
  return err.code === '42P01' || !!err.message?.includes('does not exist') ||
         !!err.message?.includes('schema cache') || !!err.code?.startsWith('42');
}

const byDueAsc = (a: AcademicTask, b: AcademicTask) =>
  new Date(a.due_date).getTime() - new Date(b.due_date).getTime();

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"
    />
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

interface TaskModalProps {
  open: boolean;
  initialDate?: string;
  editTask?: AcademicTask | null;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}

function TaskModal({ open, initialDate, editTask, onClose, onSaved, userId }: TaskModalProps) {
  const isEdit = Boolean(editTask);
  const [title, setTitle]             = useState('');
  const [eventType, setEventType]     = useState<AcademicTask['event_type']>('task');
  const [subjectCode, setSubjectCode] = useState('');
  const [dateVal, setDateVal]         = useState('');
  const [timeVal, setTimeVal]         = useState('09:00');
  const [description, setDesc]        = useState('');
  const [saving, setSaving]           = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editTask) {
      const d = new Date(editTask.due_date);
      setTitle(editTask.title); setEventType(editTask.event_type);
      setSubjectCode(editTask.subject_code ?? '');
      setDateVal(toLocalDateKey(d)); setTimeVal(d.toTimeString().slice(0, 5));
      setDesc(editTask.description ?? '');
    } else {
      setTitle(''); setEventType('task'); setSubjectCode('');
      setDateVal(initialDate ?? toLocalDateKey(new Date()));
      setTimeVal('09:00'); setDesc('');
    }
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [open, editTask, initialDate]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    const due_date = new Date(`${dateVal}T${timeVal}:00`).toISOString();
    const payload: Record<string, unknown> = {
      user_id: userId, title: title.trim(), event_type: eventType, due_date,
    };
    if (subjectCode.trim()) payload.subject_code = subjectCode.trim();
    if (description.trim()) payload.description  = description.trim();
    try {
      if (isEdit && editTask) {
        const { error } = await supabase.from('user_tasks').update(payload).eq('id', editTask.id);
        if (error) throw error;
        toast.success('Task updated!');
      } else {
        const { error } = await supabase.from('user_tasks').insert({ ...payload, is_completed: false });
        if (error) throw error;
        toast.success('Added to calendar!');
      }
      onSaved(); onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const inputCls = "w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all";
  const labelCls = "block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 font-bold text-lg flex items-center gap-2">
            <span>{isEdit ? '✏️' : '➕'}</span>
            {isEdit ? 'Edit Event' : 'Add Academic Event'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Title *</label>
            <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Compiler Design Mid-Sem Exam" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category *</label>
            <div className="grid grid-cols-4 gap-2">
              {(['test','exam','assignment','task'] as AcademicTask['event_type'][]).map(et => {
                const c = EVENT_COLORS[et];
                return (
                  <button key={et} type="button" onClick={() => setEventType(et)}
                    style={eventType === et ? { background: c.bg, borderColor: c.text, color: c.text } : {}}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      eventType === et ? '' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                    }`}>
                    <span className="text-lg">{c.icon}</span>{c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Subject / Code</label>
              <input type="text" value={subjectCode} onChange={e => setSubjectCode(e.target.value)} placeholder="e.g. CS503"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)}
                className={`${inputCls} [color-scheme:light]`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Time *</label>
              <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)}
                className={`${inputCls} [color-scheme:light]`} />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input type="text" value={description} onChange={e => setDesc(e.target.value)} placeholder="Optional notes..."
                className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-200">
              {saving ? <Spinner size={14} /> : null}
              {isEdit ? 'Save Changes' : 'Add to Calendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date; currentMonth: number; isToday: boolean; isSelected: boolean;
  events: AcademicTask[]; onClick: () => void;
}
function DayCell({ date, currentMonth, isToday, isSelected, events, onClick }: DayCellProps) {
  const isCurrentMonth = date.getMonth() === currentMonth;
  const visible = events.slice(0, 2);
  const overflow = events.length - 2;
  return (
    <button onClick={onClick}
      className={`relative flex flex-col p-1 rounded-xl border text-left transition-all min-h-[58px] ${
        isSelected ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-300'
        : isToday   ? 'bg-indigo-50/60 border-indigo-200 hover:border-indigo-400'
        : isCurrentMonth ? 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
      }`}>
      <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 shrink-0 ${
        isToday ? 'bg-indigo-600 text-white'
        : isSelected && !isToday ? 'text-indigo-700'
        : isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
      }`}>{date.getDate()}</span>
      <div className="flex flex-col gap-0.5 w-full overflow-hidden">
        {visible.map(ev => {
          const c = EVENT_COLORS[ev.event_type];
          return (
            <div key={ev.id} className="flex items-center gap-0.5 w-full rounded px-0.5 py-0.5" style={{ background: c.bg }}>
              <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
              <span className="text-[9px] font-medium truncate" style={{ color: c.text }}>{ev.title}</span>
            </div>
          );
        })}
        {overflow > 0 && <span className="text-[9px] text-slate-400 pl-0.5">+{overflow} more</span>}
      </div>
    </button>
  );
}

// ─── Agenda Card ──────────────────────────────────────────────────────────────

interface AgendaCardProps {
  task: AcademicTask; onToggle: (t: AcademicTask) => void;
  onEdit: (t: AcademicTask) => void; onDelete: (t: AcademicTask) => void; toggling: boolean;
}
function AgendaCard({ task, onToggle, onEdit, onDelete, toggling }: AgendaCardProps) {
  const c = EVENT_COLORS[task.event_type];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${task.is_completed ? 'opacity-60' : ''}`}
      style={{ background: c.bg, borderColor: c.border }}>
      <button onClick={() => onToggle(task)} disabled={toggling}
        className="mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all disabled:opacity-50 hover:scale-110 bg-white"
        style={{ borderColor: task.is_completed ? c.dot : '#cbd5e1', background: task.is_completed ? c.dot : '#fff' }}>
        {task.is_completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-white" style={{ color: c.text, borderColor: c.border }}>
            {c.icon} {c.label}
          </span>
          {task.subject_code && (
            <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">{task.subject_code}</span>
          )}
          <span className="text-[10px] text-slate-400 ml-auto">🕐 {formatDisplayTime(task.due_date)}</span>
        </div>
        <p className={`text-sm font-semibold ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(task)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button onClick={() => onDelete(task)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Calendar Drawer ──────────────────────────────────────────────────────────

interface CalendarDrawerProps {
  open: boolean;
  onClose: () => void;
  tasks: AcademicTask[];
  tasksLoading: boolean;
  dbMissing: boolean;
  setDbMissing: (v: boolean) => void;
  fetchTasks: () => void;
  viewYear: number; setViewYear: (y: number) => void;
  viewMonth: number; setViewMonth: (m: number) => void;
  selectedDate: string; setSelectedDate: (d: string) => void;
  filter: FilterType; setFilter: (f: FilterType) => void;
  onToggle: (t: AcademicTask) => void;
  onEdit: (t: AcademicTask) => void;
  onDelete: (t: AcademicTask) => void;
  togglingId: string | null;
  onAddForDate: (date?: string) => void;
  seedDemoData: () => void;
  seedingDemo: boolean;
}

function CalendarDrawer({
  open, onClose, tasks, tasksLoading, dbMissing, setDbMissing, fetchTasks,
  viewYear, setViewYear, viewMonth, setViewMonth,
  selectedDate, setSelectedDate, filter, setFilter,
  onToggle, onEdit, onDelete, togglingId, onAddForDate,
  seedDemoData, seedingDemo,
}: CalendarDrawerProps) {
  const today = new Date();
  const todayKey = toLocalDateKey(today);

  const filterTasks = (evts: AcademicTask[]) => {
    if (filter === 'all') return evts;
    if (filter === 'test') return evts.filter(e => e.event_type === 'test' || e.event_type === 'exam');
    if (filter === 'assignment') return evts.filter(e => e.event_type === 'assignment');
    if (filter === 'task') return evts.filter(e => e.event_type === 'task');
    return evts;
  };

  const tasksByDate = tasks.reduce<Record<string, AcademicTask[]>>((acc, t) => {
    const key = isoToDateKey(t.due_date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const selectedDayTasks = filterTasks(tasksByDate[selectedDate] ?? [])
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const gridCells = getMonthGrid(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear()); setViewMonth(today.getMonth());
    setSelectedDate(toLocalDateKey(today));
  };

  const filterPills: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all',        label: 'All',         icon: '🗓️' },
    { key: 'test',       label: 'Tests',       icon: '📝' },
    { key: 'assignment', label: 'Assignments', icon: '📋' },
    { key: 'task',       label: 'Tasks',       icon: '✅' },
  ];

  const selectedDateLabel = formatFullDate(`${selectedDate}T12:00:00`);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 h-full z-50 w-full sm:w-[560px] bg-white border-l border-slate-200 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-slate-900 font-bold text-base">Academic Calendar</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onAddForDate()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-indigo-200">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Event
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {dbMissing && (
            <div className="m-4 border border-red-200 bg-red-50 rounded-xl p-4">
              <p className="text-red-700 font-bold text-sm mb-1">⚠️ <code className="bg-red-100 px-1 rounded text-red-800 font-mono text-xs">user_tasks</code> table missing or wrong schema</p>
              <p className="text-slate-600 text-xs mb-3">Go to <strong className="text-slate-800">Supabase → SQL Editor → New Query</strong>, paste and run:</p>
              <pre className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-[10px] text-emerald-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
{`CREATE TABLE IF NOT EXISTS public.user_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text NOT NULL,
  event_type   text NOT NULL CHECK (event_type IN ('test','assignment','exam','task')),
  due_date     timestamptz NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  subject_code text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.user_tasks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`}
              </pre>
              <button onClick={() => { setDbMissing(false); fetchTasks(); }}
                className="mt-3 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all">
                ↻ I ran it — Retry
              </button>
            </div>
          )}

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-slate-900 font-bold text-base min-w-[130px] text-center">{MONTH_NAMES[viewMonth]} {viewYear}</h3>
                <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={goToToday} className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition-all">
                  Today
                </button>
              </div>
              <div className="flex items-center gap-1">
                {filterPills.map(p => (
                  <button key={p.key} onClick={() => setFilter(p.key)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                      filter === p.key
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                    }`}>
                    {p.icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-7">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="py-1 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{d}</div>
              ))}
            </div>

            {tasksLoading ? (
              <div className="grid grid-cols-7 gap-1" style={{ minHeight: 300 }}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl animate-pulse min-h-[58px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {gridCells.map((date, idx) => {
                  const key = toLocalDateKey(date);
                  const evts = filterTasks(tasksByDate[key] ?? []);
                  return (
                    <DayCell key={idx} date={date} currentMonth={viewMonth}
                      isToday={key === todayKey} isSelected={key === selectedDate}
                      events={evts}
                      onClick={() => {
                        setSelectedDate(key);
                        if (date.getMonth() !== viewMonth) { setViewYear(date.getFullYear()); setViewMonth(date.getMonth()); }
                      }}
                    />
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap pt-1">
              {(Object.entries(EVENT_COLORS) as [AcademicTask['event_type'], typeof EVENT_COLORS[AcademicTask['event_type']]][]).map(([type, c]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                  <span className="text-[10px] text-slate-500">{c.label}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div>
                  <p className="text-slate-900 font-bold text-sm">{selectedDateLabel}</p>
                  <p className="text-slate-500 text-xs">{selectedDayTasks.length === 0 ? 'No events' : `${selectedDayTasks.length} event${selectedDayTasks.length > 1 ? 's' : ''}`}</p>
                </div>
                <button onClick={() => onAddForDate(selectedDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Task
                </button>
              </div>
              <div className="p-3">
                {selectedDayTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2 opacity-30">📅</div>
                    <p className="text-slate-400 text-sm mb-4">Nothing scheduled</p>
                    <button onClick={() => onAddForDate(selectedDate)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 mx-auto">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      + Add task for this day
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayTasks.map(t => (
                      <AgendaCard key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} toggling={togglingId === t.id} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {tasks.length === 0 && !tasksLoading && !dbMissing && (
              <button onClick={seedDemoData} disabled={seedingDemo}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 hover:border-indigo-400 text-slate-400 hover:text-indigo-600 text-sm rounded-2xl transition-all disabled:opacity-60">
                {seedingDemo ? <Spinner size={14} /> : '🧪'}
                {seedingDemo ? 'Loading demo data...' : 'Load Demo Data to explore'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Timetable Card (Right) ───────────────────────────────────────────────────

interface TimetableCardProps {
  allSlots: ClassSlot[];
  loading: boolean;
  missing: boolean;
}

function TimetableCard({ allSlots, loading, missing }: TimetableCardProps) {
  const now = new Date();
  const todayLabel = DAY_NAMES[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const slots = allSlots
    .filter(s => s.day_of_week === todayLabel)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Today's Schedule</h2>
          <p className="text-xs text-slate-500 mt-0.5">{todayLabel} · {formatFullDate(`${toLocalDateKey(new Date())}T12:00:00`)}</p>
        </div>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 shrink-0">
          {slots.length} class{slots.length === 1 ? '' : 'es'}
        </span>
      </div>

      <div>
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-[86px] h-8 bg-slate-100 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : missing ? (
          <div className="px-5 py-10 text-center">
            <div className="text-3xl mb-2 opacity-40">🗓️</div>
            <p className="text-sm font-semibold text-slate-900 mb-1">Timetable not set up yet</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Run <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">supabase/migrations/013_class_schedule.sql</code> in your Supabase SQL Editor to load the weekly routine.
            </p>
          </div>
        ) : slots.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-3xl mb-2 opacity-40">{isWeekend ? '🎉' : '☕'}</div>
            <p className="text-sm font-semibold text-slate-900">
              {isWeekend ? `It's ${todayLabel} — weekend!` : 'No classes scheduled'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isWeekend ? 'No regular classes on weekends. Check back Monday!' : 'Enjoy your free day!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {slots.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="w-[86px] shrink-0">
                  <p className="text-xs font-bold text-slate-700 tabular-nums">{formatTime12(s.start_time)}</p>
                  <p className="text-[10px] text-slate-400 tabular-nums">{formatTime12(s.end_time)}</p>
                </div>
                <div className="flex-1 min-w-0 border-l border-slate-100 pl-4">
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.subject_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    👨‍🏫 {s.teacher_name ?? 'Faculty TBD'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5">
                    {s.subject_code}
                  </span>
                  {s.room_number && (
                    <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5">
                      📍 {s.room_number}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Priority Feed (Top Right) ────────────────────────────────────────────────

interface PriorityFeedProps {
  urgent: AcademicTask[];
  recent: FeedUpload[];
  general: FeedUpload[];
  tasksLoading: boolean;
  uploadsLoading: boolean;
  onSelectTask: (t: AcademicTask) => void;
  onBrowse: () => void;
  unvotedCount?: number;
  onNavigateKarma?: () => void;
}

function PriorityFeed({ urgent, recent, general, tasksLoading, uploadsLoading, onSelectTask, onBrowse, unvotedCount = 0, onNavigateKarma }: PriorityFeedProps) {
  const sectionTitle = "text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5";

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">Recent Activity & Priorities</h2>
        <p className="text-xs text-slate-500 mt-0.5">What needs your attention first</p>
      </div>

      <div className="divide-y divide-slate-100">

        {/* Priority 0: Community Verification Alert */}
        {unvotedCount > 0 && onNavigateKarma && (
          <div className="py-3 px-5 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-3">
              <span className="text-lg shrink-0">⚡</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">
                  {unvotedCount} new upload{unvotedCount !== 1 ? 's' : ''} need your verification vote
                </p>
                <p className="text-xs text-amber-700 mt-0.5">Help your peers by verifying shared resources. Earn +2 karma per vote.</p>
              </div>
              <button onClick={onNavigateKarma}
                className="shrink-0 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-amber-200">
                Review & Vote
              </button>
            </div>
          </div>
        )}

        {/* Priority 1: Urgent deadlines */}
        <div className="py-2">
          <p className={`${sectionTitle} text-red-600 px-5 pt-2 pb-1`}>
            🔴 Urgent Deadlines · Next 48h
          </p>
          {tasksLoading ? (
            <div className="px-5 py-3 space-y-2">
              {[0, 1].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : urgent.length === 0 ? (
            <div className="mx-5 my-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium rounded-xl px-3 py-2.5">
              ✅ Nothing urgent — you're on top of it!
            </div>
          ) : (
            <div className="pb-1">
              {urgent.map(t => {
                const c = EVENT_COLORS[t.event_type];
                const tag = dueTag(t.due_date);
                const overdue = tag.tone === 'overdue';
                return (
                  <button key={t.id} onClick={() => onSelectTask(t)}
                    className={`w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors border-l-4 ${
                      overdue ? 'border-l-red-500' : 'border-l-orange-400'
                    }`}>
                    <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                      {c.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {t.subject_code && <span className="font-medium text-slate-600">{t.subject_code} · </span>}
                        {formatDisplayTime(t.due_date)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${DUE_TAG_STYLES[tag.tone]}`}>
                      {tag.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Priority 2: Recent notes & PYQs */}
        <div className="py-2">
          <p className={`${sectionTitle} text-indigo-600 px-5 pt-2 pb-1`}>
            🟣 New Notes & PYQs · Last 7 Days
          </p>
          {uploadsLoading ? (
            <div className="px-5 py-3 space-y-2">
              {[0, 1].map(i => <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : recent.length === 0 ? (
            <p className="px-5 py-2 text-xs text-slate-400">No new material this week.</p>
          ) : (
            <div className="pb-1">
              {recent.map(u => {
                const meta = UPLOAD_META[u.category] ?? FALLBACK_UPLOAD_META;
                const sub = relOne(u.subjects);
                const uploader = relOne(u.users);
                return (
                  <button key={u.id} onClick={onBrowse}
                    className="w-full text-left flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors">
                    <span className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-sm ${meta.chip}`}>
                      {meta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.title_syllabus}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {sub ? `${sub.subject_name} · ` : ''}
                        {uploader?.full_name ?? 'Peer upload'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(u.created_at)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Priority 3: General peer uploads */}
        {(general.length > 0 || !uploadsLoading) && (
          <div className="py-2 pb-3">
            <p className={`${sectionTitle} text-slate-500 px-5 pt-2 pb-1`}>
              ⚪ Earlier Peer Uploads
            </p>
            {!uploadsLoading && general.length === 0 ? (
              <p className="px-5 py-1 text-xs text-slate-400">Nothing else in the vault yet.</p>
            ) : (
              <div className="pb-1 opacity-80">
                {general.map(u => {
                  const meta = UPLOAD_META[u.category] ?? FALLBACK_UPLOAD_META;
                  const sub = relOne(u.subjects);
                  return (
                    <button key={u.id} onClick={onBrowse}
                      className="w-full text-left flex items-center gap-3 px-5 py-2 hover:bg-slate-50 transition-colors">
                      <span className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center text-xs ${meta.chip}`}>
                        {meta.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{u.title_syllabus}</p>
                        <p className="text-[10px] text-slate-400">{sub?.subject_name ?? meta.label}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(u.created_at)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Upcoming Events Timeline (Bottom) ────────────────────────────────────────

interface UpcomingTimelineProps {
  milestones: AcademicTask[];
  loading: boolean;
  onSelect: (t: AcademicTask) => void;
}

function UpcomingTimeline({ milestones, loading, onSelect }: UpcomingTimelineProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Upcoming Events & Tests</h2>
          <p className="text-xs text-slate-500 mt-0.5">Your next milestones beyond the 48-hour window</p>
        </div>
        {milestones.length > 0 && (
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
            {milestones.length} scheduled
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="min-w-[180px] h-[120px] bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2 opacity-40">🎯</div>
            <p className="text-sm font-semibold text-slate-900">No upcoming milestones</p>
            <p className="text-xs text-slate-500 mt-0.5">Add tests & submissions from the calendar to track them here.</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-[22px] left-4 right-4 h-px bg-slate-200 hidden md:block" />
            <div className="flex gap-3 overflow-x-auto pb-2 relative">
              {milestones.map(t => {
                const c = EVENT_COLORS[t.event_type];
                const d = new Date(t.due_date);
                const tag = dueTag(t.due_date);
                return (
                  <button key={t.id} onClick={() => onSelect(t)}
                    className="min-w-[180px] max-w-[180px] text-left p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all shrink-0">
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 flex flex-col items-center justify-center leading-none shrink-0">
                        <span className="text-[8px] font-bold uppercase tracking-wide">{MONTHS_SHORT[d.getMonth()]}</span>
                        <span className="text-sm font-extrabold mt-0.5">{d.getDate()}</span>
                      </div>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-white"
                        style={{ color: c.text, borderColor: c.border }}>
                        {c.icon} {c.label}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 line-clamp-2 min-h-[2rem]">{t.title}</p>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-slate-500 truncate">
                        {t.subject_code ?? formatDisplayTime(t.due_date)}
                      </span>
                      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${DUE_TAG_STYLES[tag.tone]}`}>
                        {tag.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { profile, fetchProfile } = useAuth();
  const [fullName, setFullName]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [branches, setBranches]   = useState<{ id: string; branch_code: string; branch_name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setFullName(profile?.full_name ?? '');
    supabase.from('branches').select('id, branch_code, branch_name').order('branch_code')
      .then(({ data }) => { if (data) setBranches(data); });
  }, [open, profile?.full_name]);

  if (!open || !profile) return null;

  const branch = branches.find(b => b.id === profile.branch_id);
  const inputCls = "w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm outline-none cursor-not-allowed";
  const editCls  = "w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all";

  const handleSave = async () => {
    if (!fullName.trim()) { toast.error('Name cannot be empty'); return; }
    setSaving(true);
    // RLS (users_update_own_limited + column grants) only permits updating full_name
    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName.trim() })
      .eq('id', profile.id);
    if (error) {
      toast.error(error.message);
    } else {
      await fetchProfile(profile.auth_id);
      toast.success('Profile updated!');
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-slate-900 font-bold text-lg flex items-center gap-2">
            <span>👤</span> My Profile
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md shadow-indigo-100 shrink-0">
              {profile.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-slate-900 font-bold truncate">{profile.full_name}</p>
              <p className="text-slate-500 text-xs truncate">{profile.email}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                {profile.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Student'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className={editCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Email</label>
              <input type="text" value={profile.email} readOnly className={inputCls} />
            </div>
            <div>
              <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Enrollment ID</label>
              <input type="text" value={profile.enrollment_id ?? '—'} readOnly className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Branch</label>
              <input type="text" value={branch ? `${branch.branch_code}` : '—'} readOnly className={inputCls} />
            </div>
            <div>
              <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Semester</label>
              <input type="text" value={profile.semester ?? '—'} readOnly className={inputCls} />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Karma points earned</span>
            <span className="text-amber-600 font-bold text-lg">⭐ {profile.karma_points}</span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Academic details (branch, semester, enrollment) are managed by your admin and cannot be edited here.
          </p>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-200">
              {saving ? <Spinner size={14} /> : null}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate   = useNavigate();
  const { profile, signOut } = useAuth();

  const today = new Date();

  // ── Calendar state
  const [viewYear, setViewYear]         = useState(today.getFullYear());
  const [viewMonth, setViewMonth]       = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateKey(today));
  const [filter, setFilter]             = useState<FilterType>('all');

  // ── Task state
  const [tasks, setTasks]               = useState<AcademicTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [dbMissing, setDbMissing]       = useState(false);

  // ── Timetable state
  const [schedule, setSchedule]         = useState<ClassSlot[]>([]);
  const [schedLoading, setSchedLoading] = useState(true);
  const [schedMissing, setSchedMissing] = useState(false);

  // ── Activity feed state
  const [feedUploads, setFeedUploads]     = useState<FeedUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  // ── UI state
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [modalOpen, setModalOpen]       = useState(false);
  const [modalDate, setModalDate]       = useState<string | undefined>();
  const [editTask, setEditTask]         = useState<AcademicTask | null>(null);
  const [seedingDemo, setSeedingDemo]   = useState(false);

  // ── Karma poll state
  const [unvotedCount, setUnvotedCount] = useState(0);

  // ─── Fetch tasks ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    if (!profile?.auth_id) return;
    setTasksLoading(true);

    const start = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const end   = new Date(viewYear, viewMonth + 2, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('user_tasks').select('*')
      .eq('user_id', profile.auth_id)
      .gte('due_date', start).lte('due_date', end)
      .order('due_date', { ascending: true });

    if (error) {
      if (isTableMissing(error)) setDbMissing(true);
      else toast.error('Failed to load events: ' + error.message);
      setTasks([]);
    } else {
      setDbMissing(false);
      setTasks((data ?? []) as AcademicTask[]);
    }
    setTasksLoading(false);
  }, [profile?.auth_id, viewYear, viewMonth]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ─── Fetch weekly schedule ────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    (async () => {
      setSchedLoading(true);
      const { data, error } = await supabase
        .from('class_schedule')
        .select('*')
        .eq('branch_id', profile.branch_id!)
        .eq('semester', profile.semester!);
      if (error) {
        if (isTableMissing(error)) setSchedMissing(true);
        setSchedule([]);
      } else {
        setSchedMissing(false);
        setSchedule((data ?? []) as ClassSlot[]);
      }
      setSchedLoading(false);
    })();
  }, [profile?.branch_id, profile?.semester]);

  // ─── Fetch activity feed uploads ──────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    (async () => {
      setUploadsLoading(true);
      const { data, error } = await supabase
        .from('uploads')
        .select('id, title_syllabus, category, created_at, users(full_name), subjects(subject_name, subject_code)')
        .eq('branch_id', profile.branch_id!)
        .eq('semester', profile.semester!)
        .neq('status', 'PURGED')
        .order('created_at', { ascending: false })
        .limit(25);
      if (!error) setFeedUploads((data ?? []) as FeedUpload[]);
      setUploadsLoading(false);
    })();
  }, [profile?.branch_id, profile?.semester]);

  // ─── Fetch unvoted queue count ─────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester || !profile?.auth_id) return;
    (async () => {
      const { data: pending } = await supabase
        .from('verification_queue')
        .select('id')
        .eq('branch_id', profile.branch_id!)
        .eq('semester', profile.semester!)
        .eq('status', 'pending');
      if (!pending || pending.length === 0) { setUnvotedCount(0); return; }
      const pendingIds = pending.map((r: { id: string }) => r.id);
      const { data: votes } = await supabase
        .from('queue_votes')
        .select('queue_id')
        .eq('user_id', profile.auth_id!)
        .in('queue_id', pendingIds);
      const votedIds = new Set((votes ?? []).map((v: { queue_id: string }) => v.queue_id));
      setUnvotedCount(pendingIds.filter(id => !votedIds.has(id)).length);
    })();
  }, [profile?.branch_id, profile?.semester, profile?.auth_id]);

  // ─── Derived buckets ──────────────────────────────────────────────────────

  const isUrgent = (t: AcademicTask) => {
    const tone = dueTag(t.due_date).tone;
    return tone === 'overdue' || tone === 'urgent';
  };

  const urgentTasks   = tasks.filter(t => !t.is_completed && isUrgent(t)).sort(byDueAsc);
  const upcomingMilestones = tasks
    .filter(t => !t.is_completed && !isUrgent(t) && new Date(t.due_date).getTime() >= startOfTodayMs())
    .sort(byDueAsc)
    .slice(0, 8);

  const recentUploads  = feedUploads.filter(u => daysAgo(u.created_at) <= 7).slice(0, 5);
  const generalUploads = feedUploads.filter(u => daysAgo(u.created_at) > 7).slice(0, 5);

  const pendingCount = tasks.filter(t => !t.is_completed).length;

  // ─── Task operations ──────────────────────────────────────────────────────

  const handleToggle = async (task: AcademicTask) => {
    setTogglingId(task.id);
    const newVal = !task.is_completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_completed: newVal } : t));
    const { error } = await supabase.from('user_tasks').update({ is_completed: newVal }).eq('id', task.id);
    if (error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_completed: task.is_completed } : t));
      toast.error('Failed to update');
    }
    setTogglingId(null);
  };

  const handleDelete = async (task: AcademicTask) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const { error } = await supabase.from('user_tasks').delete().eq('id', task.id);
    if (error) { toast.error('Failed to delete'); fetchTasks(); }
    else toast.success('Task deleted');
  };

  const handleEdit = (task: AcademicTask) => { setEditTask(task); setModalOpen(true); };
  const handleSignOut = async () => { await signOut(); navigate('/'); };
  const openAddModal = (date?: string) => {
    setEditTask(null); setModalDate(date ?? toLocalDateKey(new Date())); setModalOpen(true);
  };

  const openDrawerAtTask = (task: AcademicTask) => {
    setSelectedDate(isoToDateKey(task.due_date));
    setViewYear(new Date(task.due_date).getFullYear());
    setViewMonth(new Date(task.due_date).getMonth());
    setDrawerOpen(true);
  };

  // ─── Seed demo data ───────────────────────────────────────────────────────

  const seedDemoData = async () => {
    if (!profile?.auth_id) return;
    setSeedingDemo(true);
    const y = today.getFullYear(); const m = today.getMonth();
    const row = (title: string, event_type: AcademicTask['event_type'], due_date: Date, is_completed: boolean) => ({
      user_id: profile!.auth_id, title, event_type, due_date: due_date.toISOString(), is_completed,
    });
    const samples = [
      row('CN-II Quiz – Unit 3',          'test',       new Date(y, m,  2, 10,  0), false),
      row('SE SRS Document Submission',   'assignment', new Date(y, m,  3, 23, 59), false),
      row('Compiler Design Mid-Sem',      'exam',       new Date(y, m,  8, 10,  0), false),
      row('TOC Assignment 2',             'assignment', new Date(y, m, 12, 17,  0), false),
      row('Revise CN Routing Algorithms', 'task',       new Date(y, m, 15,  9,  0), false),
      row('Networks Lab Test',            'test',       new Date(y, m, 20, 14,  0), false),
      row('Elective-I Presentation',      'task',       new Date(y, m, 25, 11, 30), false),
      row('SE Mid-Semester Exam',         'exam',       new Date(y, m + 1, 2, 10, 0), false),
    ];
    const { error } = await supabase.from('user_tasks').insert(samples);
    await fetchTasks();
    if (error) {
      if (isTableMissing(error)) { setDbMissing(true); toast.error('Table not found — run the SQL in the drawer!'); }
      else toast.error('Seed failed: ' + error.message);
    } else { setDbMissing(false); toast.success('🎉 Demo milestones loaded!'); }
    setSeedingDemo(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Task Modal */}
      {profile && (
        <TaskModal
          open={modalOpen}
          initialDate={modalDate}
          editTask={editTask}
          onClose={() => { setModalOpen(false); setEditTask(null); }}
          onSaved={fetchTasks}
          userId={profile.auth_id}
        />
      )}

      {/* Slide-over Calendar Drawer */}
      <CalendarDrawer
        open={drawerOpen} onClose={() => setDrawerOpen(false)}
        tasks={tasks} tasksLoading={tasksLoading} dbMissing={dbMissing}
        setDbMissing={setDbMissing} fetchTasks={fetchTasks}
        viewYear={viewYear} setViewYear={setViewYear}
        viewMonth={viewMonth} setViewMonth={setViewMonth}
        selectedDate={selectedDate} setSelectedDate={setSelectedDate}
        filter={filter} setFilter={setFilter}
        onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete}
        togglingId={togglingId}
        onAddForDate={(d) => { openAddModal(d); }}
        seedDemoData={seedDemoData} seedingDemo={seedingDemo}
      />

      {/* Profile Modal */}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Side navigation drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-white border-r border-slate-200 flex flex-col h-full z-50 shadow-xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-lg text-white font-bold shadow-md shadow-indigo-100 shrink-0">
                  {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-slate-900 font-bold truncate">{profile?.full_name}</p>
                  <p className="text-slate-500 text-xs truncate">{profile?.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-amber-500 font-bold text-sm">⭐ {profile?.karma_points ?? 0}</span>
                <span className="text-slate-400 text-xs">karma points</span>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              <button onClick={() => { setSidebarOpen(false); setProfileOpen(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-indigo-700 bg-indigo-50 border border-indigo-100 text-sm font-semibold">
                <span>👤</span> Profile
              </button>
              <button onClick={() => setSidebarOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition-all">
                <span>🏠</span> Dashboard
              </button>
              <button onClick={() => navigate('/upload')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition-all">
                <span>📝</span> Notes
              </button>
              <button onClick={() => { setSidebarOpen(false); navigate('/karma-poll'); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition-all relative">
                <span>🗳️</span> Karma Poll
                {unvotedCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {Math.min(unvotedCount, 99)}
                  </span>
                )}
              </button>
              <button onClick={() => toast('Settings coming soon!', { icon: '⚙️' })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition-all">
                <span>⚙️</span> Settings
              </button>
            </nav>
            <div className="p-4 border-t border-slate-100">
              <button onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 text-sm font-medium transition-all">
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all shrink-0" aria-label="Menu">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                Welcome back, {profile?.full_name?.split(' ')[0] ?? 'Student'} 👋
              </h1>
              <div className="hidden xs:flex sm:flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                  Semester {profile?.semester ?? '—'}
                </span>
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  ⭐ {profile?.karma_points ?? 0} karma
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setDrawerOpen(true)}
              className="relative p-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-600 transition-all" aria-label="Calendar">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {Math.min(pendingCount, 9)}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/upload')}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition-all active:scale-95" aria-label="Upload">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Top Left: Recent Activity & Priorities */}
          <div className="lg:col-span-7">
            <PriorityFeed
              urgent={urgentTasks}
              recent={recentUploads}
              general={generalUploads}
              tasksLoading={tasksLoading}
              uploadsLoading={uploadsLoading}
              onSelectTask={openDrawerAtTask}
              onBrowse={() => navigate('/upload')}
              unvotedCount={unvotedCount}
              onNavigateKarma={() => navigate('/karma-poll')}
            />
          </div>

          {/* Top Right: Daily Schedule */}
          <div className="lg:col-span-5">
            <TimetableCard
              allSlots={schedule}
              loading={schedLoading}
              missing={schedMissing}
            />
          </div>
        </div>

        {/* Bottom: Upcoming Events & Tests timeline */}
        <UpcomingTimeline
          milestones={upcomingMilestones}
          loading={tasksLoading}
          onSelect={openDrawerAtTask}
        />

      </main>
    </div>
  );
}
