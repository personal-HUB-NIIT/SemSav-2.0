import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import {
  fetchSemesterSubjects, fetchAttendanceSummary, fetchAttendanceLogs,
  markAttendance, computeStats, computeOverall, todayKey,
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
  return { subject_id: subjectId, total_held: 0, attended: 0, cancelled: 0 };
}

interface LoadArgs { auth_id: string; branch_id: string; semester: number; }

async function loadAttendance(args: LoadArgs): Promise<{
  subs: AttendanceSubject[]; summaryMap: Map<string, SubjectSummary>; logRows: AttendanceLogRow[];
}> {
  const [subs, summaryMap, logRows] = await Promise.all([
    fetchSemesterSubjects(args.branch_id, args.semester),
    fetchAttendanceSummary(args.auth_id),
    fetchAttendanceLogs(args.auth_id),
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
  present:   { idle: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50', active: 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200' },
  absent:    { idle: 'border-red-200 text-red-600 hover:bg-red-50',             active: 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-200' },
  cancelled: { idle: 'border-slate-200 text-slate-500 hover:bg-slate-100',      active: 'bg-slate-700 border-slate-700 text-white shadow-sm shadow-slate-300' },
};

function StatusButtons({
  current, disabled, onPick,
}: {
  current?: AttendanceStatus; disabled: boolean;
  onPick: (s: AttendanceStatus) => void;
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
            {STATUS_META[s].icon} {STATUS_META[s].label}
          </button>
        );
      })}
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

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

  const overall = computeOverall(allStats);
  const dangerCount = allStats.filter(s => s.zone === 'danger').length;

  const today = todayKey();
  const statusToday = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    for (const l of logs) if (l.date === today) m.set(l.subject_id, l.status);
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
    if (!profile?.auth_id || savingKey) return;
    const key = subjectId + dateKey;
    const prevLogs = logs;
    setSavingKey(key);

    // Optimistic UI: reflect the new status instantly
    setLogs(prev => {
      const rest = prev.filter(l => !(l.subject_id === subjectId && l.date === dateKey));
      return [{ id: `tmp-${key}`, subject_id: subjectId, date: dateKey, status }, ...rest];
    });

    try {
      await markAttendance(profile.auth_id, subjectId, dateKey, status);
      toast.success(dateKey === today ? `Marked ${STATUS_META[status].label.toLowerCase()}` : 'Entry updated');
      // Re-aggregate server-side so gauges stay exact
      if (profile.auth_id && profile.branch_id && profile.semester) {
        const { subs, summaryMap, logRows } = await loadAttendance({
          auth_id: profile.auth_id, branch_id: profile.branch_id, semester: profile.semester,
        });
        setSubjects(subs); setSummary(summaryMap); setLogs(logRows);
      }
    } catch (err) {
      setLogs(prevLogs);
      toast.error(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSavingKey(null);
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
            <h1 className="text-base sm:text-lg font-bold text-slate-900">📅 Attendance Tracker</h1>
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
            ⚠️ The <code className="font-mono">attendance_logs</code> table isn&apos;t set up yet.
            Run <code className="font-mono">supabase/migrations/017_attendance.sql</code> in the Supabase SQL Editor.
          </div>
        )}

        {/* Overall strip */}
        {!loading && !missingTable && subjects.length > 0 && (
          <div className={`rounded-2xl border p-5 flex flex-wrap items-center gap-5 ${
            overall.zone === 'danger' ? 'bg-red-50 border-red-200'
            : overall.zone === 'borderline' ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
          }`}>
            <Gauge pct={overall.pct} zone={overall.zone} size={96} />
            <div className="min-w-0 space-y-1">
              <h2 className="font-bold text-slate-900">Overall Attendance</h2>
              <p className="text-sm text-slate-600">
                ✅ {allStats.reduce((n, s) => n + s.attended, 0)} attended ·{' '}
                ❌ {allStats.reduce((n, s) => n + s.total_held - s.attended, 0)} absent ·{' '}
                🚫 {allStats.reduce((n, s) => n + s.cancelled, 0)} cancelled
              </p>
              <p className={`text-sm font-semibold ${
                overall.zone === 'danger' ? 'text-red-700' : overall.zone === 'borderline' ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                {overall.zone === 'danger'
                  ? `⚠️ Below 75% — bunking is banned for you now!`
                  : overall.zone === 'borderline'
                    ? '⚡ Borderline zone — keep showing up'
                    : '✅ Safe zone — great streak!'}
              </p>
              {statusToday.size > 0 && (
                <span className="inline-block text-[11px] font-semibold bg-white/70 border border-slate-200 rounded-full px-2.5 py-0.5 text-slate-600">
                  {statusToday.size}/{subjects.length} subjects marked today
                </span>
              )}
            </div>
            {dangerCount > 0 && (
              <div className="ml-auto text-center bg-white/70 border border-red-200 rounded-xl px-4 py-3 shrink-0">
                <p className="text-2xl font-bold text-red-600">{dangerCount}</p>
                <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">
                  subject{dangerCount > 1 ? 's' : ''} at risk
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {([['today', '📌 Mark Today'], ['history', '🕓 History']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === key ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {label}
            </button>
          ))}
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
                <p className="text-4xl mb-3">📚</p>
                <p className="font-medium">No subjects found for Semester {profile?.semester}</p>
                <p className="text-sm mt-1">Ask an admin to seed subjects for your branch.</p>
              </div>
            )}
            {subjects.map((sub, i) => {
              const st = allStats[i];
              const cur = statusToday.get(sub.id);
              const busy = savingKey === sub.id + today;
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
                        ✅ {st.attended} · ❌ {st.total_held - st.attended} · 🚫 {st.cancelled}
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
                    <StatusButtons current={cur} disabled={busy || missingTable} onPick={(s) => handleMark(sub.id, s)} />
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
                <p className="text-4xl mb-3">🕓</p>
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
                    const busy = savingKey === entry.subject_id + entry.date;
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
    </div>
  );
}
