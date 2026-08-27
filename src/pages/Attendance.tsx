import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { AlertTriangle, History, BookOpen } from 'lucide-react';
import Tabs from '../components/Tabs';
import Button from '../components/Button';
import { CardSkeleton } from '../components/Skeleton';
import {
  fetchSemesterSubjects, fetchAttendanceSummary, fetchAttendanceLogs,
  markAttendance, clearAttendance, addExtraClass, computeStats, todayKey,
  STATUS_META, ZONE_COLORS,
} from '../hooks/useAttendance';
import type {
  AttendanceSubject, AttendanceLogRow, AttendanceStatus, SubjectSummary, SubjectStats, AttendanceZone,
} from '../hooks/useAttendance';

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

function Gauge({ pct, zone, size = 84 }: { pct: number; zone: AttendanceZone; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
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

const ACTION_STYLES: Record<AttendanceStatus, { idle: string; active: string }> = {
  present: { idle: 'border-emerald-400/25 text-emerald-400 hover:bg-emerald-500/15', active: 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-500/20' },
  absent:  { idle: 'border-red-400/25 text-red-400 hover:bg-red-500/15',           active: 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/20' },
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
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              active ? ACTION_STYLES[s].active : `${ACTION_STYLES[s].idle} bg-white/[0.04]`
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
          className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-white/[0.15] text-slate-400 hover:text-white hover:bg-white/[0.08] bg-white/[0.04]"
        >
          ↩ Clear
        </button>
      )}
    </div>
  );
}

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

  const handleMark = async (subjectId: string, status: AttendanceStatus, dateKey: string = today) => {
    if (!profile?.auth_id) return;
    const key = subjectId + dateKey;
    if (savingKeys.has(key)) return;

    const prevLogs = logs;
    const prevSummary = new Map(summary);
    setSavingKeys(prev => new Set(prev).add(key));

    const oldLog = logs.find(l => l.subject_id === subjectId && l.date === dateKey && !l.is_extra);
    const oldStatus = oldLog?.status;
    const oldCount = oldLog?.class_count ?? 0;

    setLogs(prev => {
      const rest = prev.filter(l => !(l.subject_id === subjectId && l.date === dateKey && !l.is_extra));
      return [{ id: `tmp-${key}`, subject_id: subjectId, date: dateKey, status, class_count: 1, is_extra: false }, ...rest];
    });

    setSummary(prev => {
      const next = new Map(prev);
      const cur = next.get(subjectId) ?? { subject_id: subjectId, total_held: 0, attended: 0 };
      let { total_held, attended } = cur;
      if (oldStatus === 'present') { attended -= oldCount; total_held -= oldCount; }
      else if (oldStatus === 'absent') { total_held -= oldCount; }
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

    const oldLog = logs.find(l => l.subject_id === subjectId && l.date === dateKey && !l.is_extra);
    const oldStatus = oldLog?.status;
    const oldCount = oldLog?.class_count ?? 0;

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

  const inputClass = 'w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 transition-all duration-200';
  const selectClass = 'w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 transition-all duration-200 appearance-none cursor-pointer';

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">

      {/* Header */}
      <header className="bg-slate-900/95 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all duration-200"
            aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white">Attendance Tracker</h1>
            <p className="text-xs text-slate-400">Stay above the 75% mandate</p>
          </div>
          <button onClick={() => setReloadTick(t => t + 1)}
            className="ml-auto p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/15 rounded-xl transition-all duration-200"
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
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300">
            <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 inline" /> The <code className="font-mono">attendance_logs</code> table isn&apos;t set up yet.</span>
            Run <code className="font-mono">supabase/migrations/017_attendance.sql</code> in the Supabase SQL Editor.
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <Tabs
            tabs={[
              { key: 'today', label: 'Mark Today' },
              { key: 'history', label: 'History' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as Tab)}
          />
          <Button variant="primary" size="sm" onClick={() => setExtraModalOpen(true)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Extra Class
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {/* Today tab */}
        {!loading && tab === 'today' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjects.length === 0 && !missingTable && (
              <div className="md:col-span-2 text-center py-14 text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-600" />
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
                  className="bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 border border-white/[0.08] hover:border-white/[0.15] hover:shadow-xl hover:shadow-indigo-500/[0.03] transition-all duration-300">
                  <div className="flex items-center gap-5">
                    <Gauge pct={st.pct} zone={st.zone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-bold text-white truncate">{sub.subject_name}</h3>
                        {sub.is_lab && (
                          <span className="text-[10px] font-bold uppercase bg-violet-500/15 border border-violet-500/25 text-violet-400 rounded-full px-2 py-0.5 shrink-0">Lab</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{sub.subject_code}</p>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {st.attended} attended · {st.total_held - st.attended} absent
                      </p>
                      <span className={`inline-block mt-2 rounded-full px-3 py-1 text-[11px] font-semibold ${ZONE_COLORS[st.zone].chipBg}`}>
                        {st.zone === 'danger' ? 'Danger zone' : st.zone === 'borderline' ? 'Borderline' : 'Safe'}
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-medium text-slate-300 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3">
                    {st.total_held === 0
                      ? 'No classes logged yet — start marking below.'
                      : st.zone === 'danger'
                        ? `Attend the next ${st.needAttend} class${st.needAttend > 1 ? 'es' : ''} to reach 75%.`
                        : st.canMiss > 0
                          ? `You can afford to miss ${st.canMiss} more class${st.canMiss > 1 ? 'es' : ''}.`
                          : 'Exactly at the limit — don\u2019t miss the next one.'}
                  </p>

                  <div className="mt-4">
                    <StatusButtons current={cur} disabled={busy || missingTable} onPick={(s) => handleMark(sub.id, s)} onClear={() => handleClear(sub.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* History tab */}
        {!loading && tab === 'history' && (
          <div className="space-y-4">
            {groupedHistory.length === 0 && (
              <div className="text-center py-14 text-slate-400">
                <History className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="font-medium">No history yet</p>
                <p className="text-sm mt-1">Marks you record will appear here.</p>
              </div>
            )}
            {groupedHistory.map(([dateKey, entries]) => (
              <div key={dateKey} className="bg-white/[0.04] backdrop-blur-xl rounded-2xl overflow-hidden border border-white/[0.08]">
                <div className="px-6 py-3 bg-white/[0.06] border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{dayLabel(dateKey)}</span>
                  <span className="text-[11px] text-slate-500 font-mono">{entries.length} entr{entries.length > 1 ? 'ies' : 'y'}</span>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {entries.map(entry => {
                    const sub = subjectById.get(entry.subject_id);
                    const busy = savingKeys.has(entry.subject_id + entry.date);
                    return (
                      <div key={entry.id} className="px-6 py-4 flex flex-wrap items-center gap-3 hover:bg-white/[0.02] transition-colors duration-200">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {sub ? sub.subject_name : 'Unknown subject'}
                            {sub && <span className="ml-2 text-[10px] text-slate-500 font-mono">{sub.subject_code}</span>}
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

      {/* Extra Class Modal */}
      {extraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!extraSaving) setExtraModalOpen(false); }} />
          <div className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 border border-white/[0.1]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Add Extra Class Attendance</h2>
              <button onClick={() => setExtraModalOpen(false)} disabled={extraSaving}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all duration-200 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Subject</label>
              <select value={extraSubjectId} onChange={e => setExtraSubjectId(e.target.value)}
                className={selectClass}>
                <option value="" className="bg-slate-900 text-white">Select subject…</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">{s.subject_name} ({s.subject_code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Date</label>
              <input type="date" value={extraDate} onChange={e => setExtraDate(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Number of Classes</label>
              <input type="number" min={1} max={10} value={extraCount} onChange={e => setExtraCount(Math.max(1, parseInt(e.target.value) || 1))}
                className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-2">Status</label>
              <div className="flex gap-2">
                {(['present', 'absent'] as AttendanceStatus[]).map(s => (
                  <button key={s} onClick={() => setExtraStatus(s)}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                      extraStatus === s
                        ? s === 'present'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                          : 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/20'
                        : 'border-white/[0.1] text-slate-400 hover:text-white hover:bg-white/[0.08] bg-white/[0.04]'
                    }`}>
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full"
              loading={extraSaving}
              disabled={!extraSubjectId || !extraDate}
              onClick={handleExtraClass}
            >
              {extraSaving ? 'Saving…' : 'Add Extra Class'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
