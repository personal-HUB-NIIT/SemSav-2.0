import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { AlertTriangle, History, BookOpen } from 'lucide-react';
import {
  fetchSemesterSubjects, fetchAttendanceSummary, fetchAttendanceLogs,
  markAttendance, clearAttendance, addExtraClass, computeStats, todayKey,
  STATUS_META, ZONE_COLORS,
} from '../hooks/useAttendance';
import type {
  AttendanceSubject, AttendanceLogRow, AttendanceStatus, SubjectSummary, SubjectStats, AttendanceZone,
} from '../hooks/useAttendance';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prettyDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function dayLabel(dateKey: string): string {
  const t = todayKey();
  if (dateKey === t) return 'Today';
  const [y, m, d] = t.split('-').map(Number);
  const yest = new Date(y, m - 1, d - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yk = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
  if (dateKey === yk) return 'Yesterday';
  return prettyDate(dateKey);
}

function emptySummary(subjectId: string): SubjectSummary {
  return { subject_id: subjectId, total_held: 0, attended: 0 };
}

interface LoadArgs { auth_id: string; branch_id: string; semester: number; }

async function loadAttendance(args: LoadArgs): Promise<{
  subs: AttendanceSubject[]; summaryMap: Map<string, SubjectSummary>; logRows: AttendanceLogRow[];
}> {
  const [subs, summaryMap, logRows] = await Promise.all([
    fetchSemesterSubjects(args.branch_id, args.semester).catch(() => [] as AttendanceSubject[]),
    fetchAttendanceSummary(args.auth_id, args.branch_id, args.semester).catch(() => new Map<string, SubjectSummary>()),
    fetchAttendanceLogs(args.auth_id, args.branch_id, args.semester).catch(() => [] as AttendanceLogRow[]),
  ]);
  return { subs, summaryMap, logRows };
}

// ─── Circular Gauge ──────────────────────────────────────────────────────────

function Gauge({ pct, zone, size = 84 }: { pct: number; zone: AttendanceZone; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ZONE_COLORS[zone].stroke} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          className="transition-all duration-500"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-bold leading-none ${ZONE_COLORS[zone].text}`}
        style={{ fontSize: size / 4.6 }}>
        {pct % 1 === 0 ? Math.round(pct) : pct.toFixed(1)}%
      </div>
    </div>
  );
}

// ─── Quick-action buttons ────────────────────────────────────────────────────

const ACTION_STYLES: Record<AttendanceStatus, { idle: string; active: string }> = {
  present: { idle: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200' },
  absent:  { idle: 'border-red-200 text-red-600 hover:bg-red-50',           active: 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-200' },
};

function StatusButtons({
  current, disabled, onPick, onClear,
}: {
  current?: AttendanceStatus; disabled: boolean;
  onPick: (s: AttendanceStatus) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(STATUS_META) as AttendanceStatus[]).map(s => {
        const active = current === s;
        return (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            title={STATUS_META[s].label}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              active ? ACTION_STYLES[s].active : `${ACTION_STYLES[s].idle} bg-white`
            }`}
          >
            {STATUS_META[s].label}
          </button>
        );
      })}
      {current && (
        <button
          disabled={disabled}
          onClick={onClear}
          title="Clear mark"
          className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-slate-200 text-slate-500 hover:bg-slate-100 bg-white"
        >
          ↩ Clear
        </button>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type Tab = 'today' | 'history';

export default function Attendance() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [tab, setTab] = useState<Tab>('today');
  const [subjects, setSubjects]   = useState<AttendanceSubject[]>([]);
  const [summary, setSummary]     = useState<Map<string, SubjectSummary>>(new Map());
  const [logs, setLogs]           = useState<AttendanceLogRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [reloadTick, setReloadTick] = useState(0);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraSubjectId, setExtraSubjectId] = useState('');
  const [extraDate, setExtraDate] = useState(todayKey());
  const [extraCount, setExtraCount] = useState(1);
  const [extraStatus, setExtraStatus] = useState<AttendanceStatus>('present');
  const [extraSaving, setExtraSaving] = useState(false);

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { auth_id, branch_id, semester } = profile ?? {};
      if (!auth_id || !branch_id || !semester) return;
      try {
        const { subs, summaryMap, logRows } = await loadAttendance({ auth_id, branch_id, semester });
        if (!alive) return;
        setSubjects(subs);
        setSummary(summaryMap);
        setLogs(logRows);
        setMissingTable(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('does not exist') || msg.includes('schema cache')) {
          if (alive) setMissingTable(true);
        } else {
          toast.error('Failed to load attendance: ' + msg);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadTick, profile?.auth_id, profile?.branch_id, profile?.semester]);

  // ─── Derived state ─────────────────────────────────────────────────────────
  const allStats: SubjectStats[] = useMemo(
    () => subjects.map(sub => computeStats(summary.get(sub.id) ?? emptySummary(sub.id))),
    [subjects, summary],
  );

  const today = todayKey();
  const statusToday = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    for (const l of logs) if (l.date === today && !l.is_extra) m.set(l.subject_id, l.status);
    return m;
  }, [logs, today]);

  const subjectById = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, AttendanceLogRow[]>();
    for (const l of logs) {
      if (!groups.has(l.date)) groups.set(l.date, []);
      groups.get(l.date)!.push(l);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleMark = async (subjectId: string, status: AttendanceStatus, dateKey: string = today) => {
    if (!profile?.auth_id) return;
    const key = subjectId + dateKey;
    if (savingKeys.has(key)) return;

    const prevLogs = logs;
    const prevSummary = new Map(summary);
    setSavingKeys(prev => new Set(prev).add(key));

    // Find the existing regular log for this subject+date
    const oldLog = logs.find(l => l.subject_id === subjectId && l.date === dateKey && !l.is_extra);
    const oldStatus = oldLog?.status;
    const oldCount = oldLog?.class_count ?? 0;

    // Optimistic: update logs — replace regular entry
    setLogs(prev => {
      const rest = prev.filter(l => !(l.subject_id === subjectId && l.date === dateKey && !l.is_extra));
      return [{ id: `tmp-${key}`, subject_id: subjectId, date: dateKey, status, class_count: 1, is_extra: false }, ...rest];
    });

    // Optimistic: update summary
    setSummary(prev => {
      const next = new Map(prev);
      const cur = next.get(subjectId) ?? { subject_id: subjectId, total_held: 0, attended: 0 };
      let { total_held, attended } = cur;

      // Subtract old effect
      if (oldStatus === 'present') { attended -= oldCount; total_held -= oldCount; }
      else if (oldStatus === 'absent') { total_held -= oldCount; }

      // Add new effect (class_count = 1 for regular marks)
      if (status === 'present') { attended += 1; total_held += 1; }
      else if (status === 'absent') { total_held += 1; }

      next.set(subjectId, { subject_id: subjectId, total_held: Math.max(0, total_held), attended: Math.max(0, attended) });
      return next;
    });

    try {
      await markAttendance(profile.auth_id, subjectId, dateKey, status);
      toast.success(dateKey === today ? `Marked ${STATUS_META[status].label.toLowerCase()}` : 'Entry updated');
    } catch (err) {
      setLogs(prevLogs);
      setSummary(prevSummary);
      toast.error(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSavingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleClear = async (subjectId: string, dateKey: string = today) => {
    if (!profile?.auth_id) return;
    const key = subjectId + dateKey;
    if (savingKeys.has(key)) return;

    const prevLogs = logs;
    const prevSummary = new Map(summary);
    setSavingKeys(prev => new Set(prev).add(key));

    // Find the regular log to know what to subtract
    const oldLog = logs.find(l => l.subject_id === subjectId && l.date === dateKey && !l.is_extra);
    const oldStatus = oldLog?.status;
    const oldCount = oldLog?.class_count ?? 0;

    // Optimistic: remove regular entry
    setLogs(prev => prev.filter(l => !(l.subject_id === subjectId && l.date === dateKey && !l.is_extra)));

    setSummary(prev => {
      const next = new Map(prev);
      const cur = next.get(subjectId) ?? { subject_id: subjectId, total_held: 0, attended: 0 };
      let { total_held, attended } = cur;

      if (oldStatus === 'present') { attended -= oldCount; total_held -= oldCount; }
      else if (oldStatus === 'absent') { total_held -= oldCount; }

      next.set(subjectId, { subject_id: subjectId, total_held: Math.max(0, total_held), attended: Math.max(0, attended) });
      return next;
    });

    try {
      await clearAttendance(profile.auth_id, subjectId, dateKey);
      toast.success(dateKey === today ? 'Mark cleared' : 'Entry cleared');
    } catch (err) {
      setLogs(prevLogs);
      setSummary(prevSummary);
      toast.error(err instanceof Error ? err.message : 'Failed to clear attendance');
    } finally {
      setSavingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleExtraClass = async () => {
    if (!profile?.auth_id || !extraSubjectId || !extraDate || extraCount < 1) return;
    setExtraSaving(true);

    const prevLogs = logs;
    const prevSummary = new Map(summary);

    // Optimistic: add extra log entry + update summary
    const tmpId = `tmp-extra-${Date.now()}`;
    setLogs(prev => [{ id: tmpId, subject_id: extraSubjectId, date: extraDate, status: extraStatus, class_count: extraCount, is_extra: true }, ...prev]);

    setSummary(prev => {
      const next = new Map(prev);
      const cur = next.get(extraSubjectId) ?? { subject_id: extraSubjectId, total_held: 0, attended: 0 };
      const newTotal = cur.total_held + extraCount;
      const newAttended = cur.attended + (extraStatus === 'present' ? extraCount : 0);
      next.set(extraSubjectId, { subject_id: extraSubjectId, total_held: newTotal, attended: newAttended });
      return next;
    });

    try {
      await addExtraClass(profile.auth_id, extraSubjectId, extraDate, extraStatus, extraCount);
      toast.success(`Added ${extraCount} ${extraStatus} extra class${extraCount > 1 ? 'es' : ''}`);
      setExtraModalOpen(false);
      setExtraSubjectId('');
      setExtraDate(todayKey());
      setExtraCount(1);
      setExtraStatus('present');
    } catch (err) {
      setLogs(prevLogs);
      setSummary(prevSummary);
      toast.error(err instanceof Error ? err.message : 'Failed to add extra class');
    } finally {
      setExtraSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
            aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Attendance Tracker</h1>
            <p className="text-xs text-slate-500">Stay above the 75% mandate</p>
          </div>
          <button onClick={() => setReloadTick(t => t + 1)}
            className="ml-auto p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            aria-label="Refresh" title="Refresh">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Missing table notice */}
        {missingTable && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 inline" /> The <code className="font-mono">attendance_logs</code> table isn&apos;t set up yet.</span>
            Run <code className="font-mono">supabase/migrations/017_attendance.sql</code> in the Supabase SQL Editor.
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1 w-fit">
            {([['today', 'Mark Today'], ['history', 'History']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === key ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setExtraModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-indigo-200">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Extra Class
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <div className="border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin w-6 h-6" />
            <span className="text-sm">Loading your subjects…</span>
          </div>
        )}

        {/* ── Today tab: per-subject cards ── */}
        {!loading && tab === 'today' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjects.length === 0 && !missingTable && (
              <div className="md:col-span-2 text-center py-14 text-slate-500">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No subjects found for Semester {profile?.semester}</p>
                <p className="text-sm mt-1">Ask an admin to seed subjects for your branch.</p>
              </div>
            )}
            {subjects.map((sub, i) => {
              const st = allStats[i];
              const cur = statusToday.get(sub.id);
              const busy = savingKeys.has(sub.id + today);
              return (
                <div key={sub.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:shadow-slate-100 transition-all">
                  <div className="flex items-center gap-4">
                    <Gauge pct={st.pct} zone={st.zone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">{sub.subject_name}</h3>
                        {sub.is_lab && (
                          <span className="text-[10px] font-bold uppercase bg-violet-50 border border-violet-200 text-violet-700 rounded-full px-1.5 py-0.5 shrink-0">Lab</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{sub.subject_code}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {st.attended} attended · {st.total_held - st.attended} absent
                      </p>
                      <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${ZONE_COLORS[st.zone].chipBg}`}>
                        {st.zone === 'danger' ? 'Danger zone' : st.zone === 'borderline' ? 'Borderline' : 'Safe'}
                      </span>
                    </div>
                  </div>

                  {/* Quick advice */}
                  <p className="mt-3 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {st.total_held === 0
                      ? 'No classes logged yet — start marking below.'
                      : st.zone === 'danger'
                        ? `Attend the next ${st.needAttend} class${st.needAttend > 1 ? 'es' : ''} to reach 75%.`
                        : st.canMiss > 0
                          ? `You can afford to miss ${st.canMiss} more class${st.canMiss > 1 ? 'es' : ''}.`
                          : 'Exactly at the limit — don\u2019t miss the next one.'}
                  </p>

                  {/* Today's quick actions */}
                  <div className="mt-3">
                    <StatusButtons current={cur} disabled={busy || missingTable} onPick={(s) => handleMark(sub.id, s)} onClear={() => handleClear(sub.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── History tab ── */}
        {!loading && tab === 'history' && (
          <div className="space-y-4">
            {groupedHistory.length === 0 && (
              <div className="text-center py-14 text-slate-500">
                <History className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No history yet</p>
                <p className="text-sm mt-1">Marks you record will appear here.</p>
              </div>
            )}
            {groupedHistory.map(([dateKey, entries]) => (
              <div key={dateKey} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">{dayLabel(dateKey)}</span>
                  <span className="text-[11px] text-slate-400 font-mono">{entries.length} entr{entries.length > 1 ? 'ies' : 'y'}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {entries.map(entry => {
                    const sub = subjectById.get(entry.subject_id);
                    const busy = savingKeys.has(entry.subject_id + entry.date);
                    return (
                      <div key={entry.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {sub ? sub.subject_name : 'Unknown subject'}
                            {sub && <span className="ml-2 text-[10px] text-slate-400 font-mono">{sub.subject_code}</span>}
                          </p>
                        </div>
                        <StatusButtons
                          current={entry.status}
                          disabled={busy || missingTable}
                          onPick={(s) => handleMark(entry.subject_id, s, entry.date)}
                          onClear={() => handleClear(entry.subject_id, entry.date)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* ── Extra Class Modal ── */}
      {extraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => { if (!extraSaving) setExtraModalOpen(false); }} />
          <div className="relative bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Add Extra Class Attendance</h2>
              <button onClick={() => setExtraModalOpen(false)} disabled={extraSaving}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <select value={extraSubjectId} onChange={e => setExtraSubjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400">
                <option value="">Select subject…</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.subject_name} ({s.subject_code})</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input type="date" value={extraDate} onChange={e => setExtraDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
            </div>

            {/* Classes conducted */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Classes</label>
              <input type="number" min={1} max={10} value={extraCount} onChange={e => setExtraCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Status</label>
              <div className="flex gap-2">
                {(['present', 'absent'] as AttendanceStatus[]).map(s => (
                  <button key={s} onClick={() => setExtraStatus(s)}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      extraStatus === s
                        ? s === 'present'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200'
                          : 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-200'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100 bg-white'
                    }`}>
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button onClick={handleExtraClass} disabled={!extraSubjectId || !extraDate || extraSaving}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {extraSaving && <div className="border-2 border-white/30 border-t-white rounded-full animate-spin w-4 h-4" />}
              {extraSaving ? 'Saving…' : 'Add Extra Class'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
