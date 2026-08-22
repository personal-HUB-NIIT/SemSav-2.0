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

type FilterType = 'all' | 'test' | 'assignment' | 'task';

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<AcademicTask['event_type'], {
  bg: string; border: string; text: string; dot: string; label: string; icon: string;
}> = {
  test:       { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#f87171', dot: '#ef4444', label: 'Test',       icon: '📝' },
  exam:       { bg: 'rgba(168,85,247,0.12)', border: '#a855f7', text: '#c084fc', dot: '#a855f7', label: 'Exam',       icon: '🎓' },
  assignment: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fbbf24', dot: '#f59e0b', label: 'Assignment', icon: '📋' },
  task:       { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#60a5fa', dot: '#3b82f6', label: 'Task',       icon: '✅' },
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isoToDateKey(iso: string): string { return toLocalDateKey(new Date(iso)); }

function formatDisplayTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
function dueTag(iso: string): { label: string; tone: 'overdue' | 'urgent' | 'soon' | 'calm' } {
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue   = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86400000);
  if (days < 0)   return { label: 'Overdue',          tone: 'overdue' };
  if (days === 0) return { label: 'Due today',        tone: 'urgent' };
  if (days === 1) return { label: 'Due tomorrow',     tone: 'urgent' };
  if (days <= 3)  return { label: `Due in ${days} days`, tone: 'soon' };
  return { label: `Due in ${days} days`, tone: 'calm' };
}

const DUE_TAG_STYLES: Record<ReturnType<typeof dueTag>['tone'], string> = {
  overdue: 'bg-red-500/20 text-red-400',
  urgent:  'bg-amber-500/20 text-amber-400',
  soon:    'bg-indigo-500/20 text-indigo-300',
  calm:    'bg-slate-800/80 text-slate-300',
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

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin"
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
    const payload: Record<string, any> = {
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
    } catch (err: any) { toast.error(err.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/70 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <span>{isEdit ? '✏️' : '➕'}</span>
            {isEdit ? 'Edit Event' : 'Add Academic Event'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Title *</label>
            <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. OOPs Mid-Sem Exam"
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Category *</label>
            <div className="grid grid-cols-4 gap-2">
              {(['test','exam','assignment','task'] as AcademicTask['event_type'][]).map(et => {
                const c = EVENT_COLORS[et];
                return (
                  <button key={et} type="button" onClick={() => setEventType(et)}
                    style={eventType === et ? { background: c.bg, borderColor: c.border, color: c.text } : {}}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      eventType === et ? '' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                    }`}>
                    <span className="text-lg">{c.icon}</span>{c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Subject / Code</label>
              <input type="text" value={subjectCode} onChange={e => setSubjectCode(e.target.value)} placeholder="e.g. OOPs, MPMC"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Date *</label>
              <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all [color-scheme:dark]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Time *</label>
              <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Description</label>
              <input type="text" value={description} onChange={e => setDesc(e.target.value)} placeholder="Optional notes..."
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition-all" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
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
        isSelected ? 'bg-indigo-600/20 border-indigo-500/70 ring-1 ring-indigo-500/50'
        : isToday   ? 'bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-500/60'
        : isCurrentMonth ? 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/80 hover:border-slate-600'
        : 'bg-slate-900/20 border-slate-800/30 hover:bg-slate-800/30'
      }`}>
      <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 shrink-0 ${
        isToday ? 'bg-indigo-500 text-white'
        : isSelected && !isToday ? 'text-indigo-300'
        : isCurrentMonth ? 'text-slate-200' : 'text-slate-600'
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
        {overflow > 0 && <span className="text-[9px] text-slate-500 pl-0.5">+{overflow} more</span>}
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
      style={{ background: c.bg, borderColor: c.border + '40' }}>
      <button onClick={() => onToggle(task)} disabled={toggling}
        className="mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all disabled:opacity-50 hover:scale-110"
        style={{ borderColor: task.is_completed ? c.border : c.border + '60', background: task.is_completed ? c.border : 'transparent' }}>
        {task.is_completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.border + '25', color: c.text }}>
            {c.icon} {c.label}
          </span>
          {task.subject_code && (
            <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700/50 px-1.5 py-0.5 rounded-full">{task.subject_code}</span>
          )}
          <span className="text-[10px] text-slate-500 ml-auto">🕐 {formatDisplayTime(task.due_date)}</span>
        </div>
        <p className={`text-sm font-semibold ${task.is_completed ? 'line-through text-slate-500' : 'text-white'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(task)} className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button onClick={() => onDelete(task)} className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Subject Vault Card ───────────────────────────────────────────────────────

interface VaultCardProps {
  icon: string; title: string; subtitle: string;
  gradient: string; border: string; glow: string;
  count?: number; countLabel?: string;
  onClick: () => void;
}
function VaultCard({ icon, title, subtitle, gradient, border, glow, count, countLabel, onClick }: VaultCardProps) {
  return (
    <button onClick={onClick}
      className="relative group flex flex-col p-5 rounded-2xl border text-left overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.99]"
      style={{ background: gradient, borderColor: border }}>
      {/* Glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
        style={{ background: `radial-gradient(circle at 50% 0%, ${glow}, transparent 70%)` }} />
      <div className="relative">
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="text-white font-bold text-base mb-0.5">{title}</h3>
        <p className="text-slate-400 text-xs leading-relaxed">{subtitle}</p>
        {count !== undefined && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-white font-bold text-xl">{count}</span>
            <span className="text-slate-500 text-xs">{countLabel}</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-slate-400 group-hover:text-white text-xs font-medium transition-colors">
          Browse <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ─── Up Next Banner ───────────────────────────────────────────────────────────

interface UpNextBannerProps {
  task: AcademicTask | null;
  loading: boolean;
  onViewSchedule: () => void;
}
function UpNextBanner({ task, loading, onViewSchedule }: UpNextBannerProps) {
  if (loading) {
    return <div className="h-[66px] bg-slate-800/60 border border-slate-700/50 rounded-2xl animate-pulse" />;
  }

  const c = task ? EVENT_COLORS[task.event_type] : null;
  const tag = task ? dueTag(task.due_date) : null;
  const isUrgent = tag ? tag.tone === 'urgent' || tag.tone === 'overdue' : false;

  return (
    <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all"
      style={{
        background: c ? c.bg : 'rgba(16,185,129,0.07)',
        borderColor: c ? c.border + '50' : 'rgba(16,185,129,0.25)',
      }}>
      {task && c && tag ? (
        <>
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: c.border + '30' }}>
              {c.icon}
            </div>
            {isUrgent && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: c.text }}>Up Next</span>
              {task.subject_code && (
                <span className="text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700/50 px-1.5 py-0.5 rounded-full">
                  {task.subject_code}
                </span>
              )}
            </div>
            <p className="text-white text-sm font-semibold truncate">{task.title}</p>
          </div>

          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${DUE_TAG_STYLES[tag.tone]}`}>
            {tag.label}
          </span>
        </>
      ) : (
        <>
          <span className="text-xl shrink-0">🎉</span>
          <p className="flex-1 min-w-0 text-white text-sm font-semibold truncate">All caught up! No impending deadlines 🎉</p>
        </>
      )}

      {/* Right-edge schedule trigger */}
      <button onClick={onViewSchedule}
        className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/60 text-slate-200 hover:text-white text-xs font-semibold rounded-xl transition-all active:scale-95">
        View Schedule
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
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

  const filterPills = [
    { key: 'all' as FilterType,        label: 'All',         icon: '🗓️' },
    { key: 'test' as FilterType,       label: 'Tests',       icon: '📝' },
    { key: 'assignment' as FilterType, label: 'Assignments', icon: '📋' },
    { key: 'task' as FilterType,       label: 'Tasks',       icon: '✅' },
  ];

  const selectedDateLabel = formatFullDate(`${selectedDate}T12:00:00`);
  const upcomingTasks = tasks
    .filter(t => { const d = new Date(t.due_date).getTime() - today.getTime(); return d >= 0 && d <= 7 * 86400000 && !t.is_completed; })
    .slice(0, 4);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-full z-50 w-full sm:w-[560px] bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-base">Academic Calendar</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onAddForDate()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Event
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* DB missing banner */}
          {dbMissing && (
            <div className="m-4 border border-red-500/30 bg-red-500/8 rounded-xl p-4">
              <p className="text-red-300 font-bold text-sm mb-1">⚠️ <code className="bg-red-500/20 px-1 rounded text-red-200 font-mono text-xs">user_tasks</code> table missing or wrong schema</p>
              <p className="text-slate-400 text-xs mb-3">Go to <strong className="text-slate-300">Supabase → SQL Editor → New Query</strong>, paste and run:</p>
              <pre className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-[10px] text-emerald-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
{`DROP TABLE IF EXISTS public.user_tasks CASCADE;
CREATE TABLE public.user_tasks (
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
                className="mt-3 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold rounded-xl transition-all">
                ↻ I ran it — Retry
              </button>
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-white font-bold text-base min-w-[130px] text-center">{MONTH_NAMES[viewMonth]} {viewYear}</h3>
                <button onClick={nextMonth} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={goToToday} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all">
                  Today
                </button>
              </div>
              <div className="flex items-center gap-1">
                {filterPills.map(p => (
                  <button key={p.key} onClick={() => setFilter(p.key)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                      filter === p.key
                        ? 'bg-indigo-600/25 border-indigo-500/50 text-indigo-300'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
                    }`}>
                    {p.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid header */}
            <div className="grid grid-cols-7">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="py-1 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            {tasksLoading ? (
              <div className="grid grid-cols-7 gap-1" style={{ minHeight: 300 }}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-xl animate-pulse min-h-[58px]" />
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

            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              {(Object.entries(EVENT_COLORS) as [AcademicTask['event_type'], typeof EVENT_COLORS[keyof typeof EVENT_COLORS]][]).map(([type, c]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                  <span className="text-[10px] text-slate-500">{c.label}</span>
                </div>
              ))}
            </div>

            {/* Selected day agenda */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div>
                  <p className="text-white font-bold text-sm">{selectedDateLabel}</p>
                  <p className="text-slate-500 text-xs">{selectedDayTasks.length === 0 ? 'No events' : `${selectedDayTasks.length} event${selectedDayTasks.length > 1 ? 's' : ''}`}</p>
                </div>
                <button onClick={() => onAddForDate(selectedDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-xl transition-all">
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
                    <p className="text-slate-500 text-sm mb-4">Nothing scheduled</p>
                    <button onClick={() => onAddForDate(selectedDate)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 mx-auto">
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

            {/* Upcoming 7-day strip */}
            {upcomingTasks.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
                  <span className="text-amber-400 text-sm">⚡</span>
                  <p className="text-white font-bold text-sm">This Week</p>
                  <span className="ml-auto text-xs text-slate-500">{upcomingTasks.length} pending</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {upcomingTasks.map(t => {
                    const c = EVENT_COLORS[t.event_type];
                    const dl = Math.ceil((new Date(t.due_date).getTime() - today.getTime()) / 86400000);
                    return (
                      <button key={t.id} onClick={() => {
                        setSelectedDate(isoToDateKey(t.due_date));
                        setViewYear(new Date(t.due_date).getFullYear());
                        setViewMonth(new Date(t.due_date).getMonth());
                      }}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-700/40 transition-all text-left group">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate group-hover:text-indigo-300 transition-colors">{t.title}</p>
                          <p className="text-slate-500 text-[10px]">{t.subject_code ? `${t.subject_code} · ` : ''}{formatFullDate(t.due_date)}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          dl === 0 ? 'bg-red-500/20 text-red-400' : dl <= 2 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                        }`}>{dl === 0 ? 'Today' : dl === 1 ? 'Tmr' : `${dl}d`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Load demo data */}
            {tasks.length === 0 && !tasksLoading && !dbMissing && (
              <button onClick={seedDemoData} disabled={seedingDemo}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-700 hover:border-indigo-500/50 text-slate-500 hover:text-indigo-400 text-sm rounded-2xl transition-all disabled:opacity-60">
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const VAULT_CARDS = [
  {
    icon: '📝',  title: 'Notes',            subtitle: 'Lecture notes & study material',
    gradient: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.08))',
    border: 'rgba(99,102,241,0.3)', glow: 'rgba(99,102,241,0.15)',
    cat: 'NOTES',
  },
  {
    icon: '📋',  title: 'Assignments',       subtitle: 'Pending & submitted work',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.08))',
    border: 'rgba(245,158,11,0.3)', glow: 'rgba(245,158,11,0.15)',
    cat: 'ASSIGNMENT',
  },
  {
    icon: '📅',  title: 'Tests & PYQs',      subtitle: 'Previous year question papers',
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.08))',
    border: 'rgba(239,68,68,0.3)',  glow: 'rgba(239,68,68,0.15)',
    cat: 'TEST',
  },
  {
    icon: '🧪',  title: 'Lab Files',          subtitle: 'Lab manuals & practical records',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))',
    border: 'rgba(16,185,129,0.3)', glow: 'rgba(16,185,129,0.15)',
    cat: 'LAB',
  },
  {
    icon: '🎯',  title: 'Practice Sets',      subtitle: 'Mock tests & exercise sheets',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.08))',
    border: 'rgba(168,85,247,0.3)', glow: 'rgba(168,85,247,0.15)',
    cat: 'PRACTICE',
  },
  {
    icon: '📊',  title: 'Results & Grades',   subtitle: 'Marks, grades & scorecards',
    gradient: 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(13,148,136,0.08))',
    border: 'rgba(20,184,166,0.3)', glow: 'rgba(20,184,166,0.15)',
    cat: 'RESULTS',
  },
];

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

  // ── UI state
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [modalOpen, setModalOpen]       = useState(false);
  const [modalDate, setModalDate]       = useState<string | undefined>();
  const [editTask, setEditTask]         = useState<AcademicTask | null>(null);
  const [seedingDemo, setSeedingDemo]   = useState(false);

  // ── Upload counts (for vault cards)
  const [uploadCounts, setUploadCounts] = useState<Record<string, number>>({});

  // ─── Fetch tasks ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    if (!profile?.auth_id) return;
    setTasksLoading(true);

    // Fetch 3 months centered on current view
    const start = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const end   = new Date(viewYear, viewMonth + 2, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('user_tasks').select('*')
      .eq('user_id', profile.auth_id)
      .gte('due_date', start).lte('due_date', end)
      .order('due_date', { ascending: true });

    if (error) {
      const isSchemaIssue =
        (error as any).code === '42P01' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('column') ||
        error.message?.includes('schema cache') ||
        (error as any).code?.startsWith('42');
      if (isSchemaIssue) setDbMissing(true);
      else toast.error('Failed to load events: ' + error.message);
      setTasks([]);
    } else {
      setDbMissing(false);
      setTasks((data ?? []) as AcademicTask[]);
    }
    setTasksLoading(false);
  }, [profile?.auth_id, viewYear, viewMonth]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ─── Fetch upload counts ──────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.branch_id || !profile?.semester) return;
    (async () => {
      const { data } = await supabase
        .from('uploads')
        .select('category')
        .eq('branch_id', profile.branch_id!)
        .eq('semester', profile.semester!)
        .neq('status', 'PURGED');
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((r: { category: string }) => { counts[r.category] = (counts[r.category] ?? 0) + 1; });
        setUploadCounts(counts);
      }
    })();
  }, [profile?.branch_id, profile?.semester]);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const nearestTask: AcademicTask | null = tasks
    .filter(t => !t.is_completed && new Date(t.due_date).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0] ?? null;

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
    setEditTask(null); setModalDate(date ?? selectedDate); setModalOpen(true);
  };

  // ─── Seed demo data ───────────────────────────────────────────────────────

  const seedDemoData = async () => {
    if (!profile?.auth_id) return;
    setSeedingDemo(true);
    const y = 2026; const m = 7;
    const row = (title: string, event_type: AcademicTask['event_type'], due_date: Date, is_completed: boolean) => ({
      user_id: profile!.auth_id, title, event_type, due_date: due_date.toISOString(), is_completed,
    });
    const samples = [
      row('MPMC Lab Report Submission', 'assignment', new Date(y, m,  5, 23, 59), true),
      row('Data Structures Quiz',        'test',       new Date(y, m,  8, 10,  0), true),
      row('OOPs Practical File',         'assignment', new Date(y, m, 12, 17,  0), true),
      row('Read Chapter 4 – OS',         'task',       new Date(y, m, 14,  9,  0), true),
      row('Mathematics-III Assignment',  'assignment', new Date(y, m, 22, 23, 59), false),
      row('DBMS Internal Exam',          'exam',       new Date(y, m, 23,  9, 30), false),
      row('Revise OS Deadlocks',         'task',       new Date(y, m, 23, 18,  0), false),
      row('CN Lab – Socket Programming', 'assignment', new Date(y, m, 24, 14,  0), false),
      row('OOPs Mid-Semester Exam',      'exam',       new Date(y, m, 27, 10,  0), false),
      row('MPMC Unit Test – Unit 3',     'test',       new Date(y, m, 28, 11, 30), false),
      row('Complete DS Project Report',  'task',       new Date(y, m, 29, 20,  0), false),
      row('CN Assignment – Subnetting',  'assignment', new Date(y, m, 30, 23, 59), false),
      row('DBMS Final Project Demo',     'exam',       new Date(y,  8,  3, 14,  0), false),
      row('Mathematics-III End-Sem',     'exam',       new Date(y,  8,  8,  9,  0), false),
    ];
    const { error } = await supabase.from('user_tasks').insert(samples);
    await fetchTasks();
    if (error) {
      if ((error as any).code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('column') || error.message?.includes('schema cache')) {
        setDbMissing(true); toast.error('Table not found — run the SQL in the drawer!');
      } else { toast.error('Seed failed: ' + error.message); }
    } else { setDbMissing(false); toast.success('🎉 14 demo tasks loaded!'); }
    setSeedingDemo(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">

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

      {/* Calendar Drawer */}
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

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full z-50 shadow-2xl">
            <div className="p-6 border-b border-slate-800">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-xl mb-4 shadow-lg shadow-indigo-500/20">
                {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <p className="text-white font-bold truncate">{profile?.full_name}</p>
              <p className="text-slate-500 text-sm truncate">{profile?.email}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-emerald-400 font-bold text-sm">⭐ {profile?.karma_points ?? 0}</span>
                <span className="text-slate-500 text-xs">karma points</span>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-2 gap-2">
              <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{tasks.filter(t => !t.is_completed).length}</p>
                <p className="text-slate-500 text-xs">Pending</p>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                <p className="text-emerald-400 font-bold text-lg">{tasks.filter(t => t.is_completed).length}</p>
                <p className="text-slate-500 text-xs">Done</p>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              <button onClick={() => { navigate('/dashboard'); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-indigo-600/20 border border-indigo-500/30 text-sm font-medium">
                <span>🏠</span> Dashboard
              </button>
              <button onClick={() => { navigate('/upload'); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-all">
                <span>⬆️</span> Upload Content
              </button>
              <button onClick={() => { setDrawerOpen(true); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-all">
                <span>📅</span> Academic Calendar
              </button>
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 text-sm transition-all">
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all" aria-label="Menu">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl">📚</span>
              <span className="text-white font-bold text-lg">SemSav</span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-sm">
            <span className="text-slate-500">Sem {profile?.semester}</span>
            <span className="text-slate-700">•</span>
            <span className="text-emerald-400 font-semibold">⭐ {profile?.karma_points ?? 0} karma</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Calendar toggle button */}
            <button onClick={() => setDrawerOpen(true)}
              className="relative flex items-center gap-2 px-3 py-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-white text-sm font-medium rounded-xl transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">Calendar</span>
              {tasks.filter(t => !t.is_completed).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {Math.min(tasks.filter(t => !t.is_completed).length, 9)}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/upload')}
              id="upload-btn"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Upload</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main viewport ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">

        {/* Greeting row */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-white font-bold text-2xl sm:text-3xl">
                Welcome back, {profile?.full_name?.split(' ')[0] ?? 'Student'} 👋
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Semester {profile?.semester} · Here's what's on your plate today.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3 shrink-0">
              <div className="text-center bg-slate-800/60 border border-slate-700/50 rounded-2xl px-4 py-3">
                <p className="text-white font-bold text-xl">{tasks.filter(t => !t.is_completed).length}</p>
                <p className="text-slate-500 text-xs">Pending</p>
              </div>
              <div className="text-center bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
                <p className="text-emerald-400 font-bold text-xl">{tasks.filter(t => t.is_completed).length}</p>
                <p className="text-slate-500 text-xs">Completed</p>
              </div>
            </div>
          </div>

          {/* Up Next banner */}
          <UpNextBanner
            task={nearestTask}
            loading={tasksLoading}
            onViewSchedule={() => {
              if (nearestTask) {
                setSelectedDate(isoToDateKey(nearestTask.due_date));
                setViewYear(new Date(nearestTask.due_date).getFullYear());
                setViewMonth(new Date(nearestTask.due_date).getMonth());
              }
              setDrawerOpen(true);
            }}
          />
        </div>

        {/* Subject Vaults */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">Subject Vaults</h2>
              <p className="text-slate-500 text-sm mt-0.5">Browse study material by category</p>
            </div>
            <button onClick={() => navigate('/upload')}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
              Upload
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {VAULT_CARDS.map(v => (
              <VaultCard
                key={v.cat}
                icon={v.icon} title={v.title} subtitle={v.subtitle}
                gradient={v.gradient} border={v.border} glow={v.glow}
                count={uploadCounts[v.cat]}
                countLabel={uploadCounts[v.cat] !== undefined ? 'files' : undefined}
                onClick={() => navigate('/upload')}
              />
            ))}
          </div>
        </div>

        {/* Recent activity placeholder */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">Recent Uploads</h2>
              <p className="text-slate-500 text-sm mt-0.5">Latest study material from your branch</p>
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-3 opacity-40">📂</div>
            <p className="text-white font-semibold mb-1">Browse the full vault</p>
            <p className="text-slate-500 text-sm mb-5">View notes, assignments, and test papers shared by your batch.</p>
            <button onClick={() => navigate('/upload')}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-all">
              Go to Uploads →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
