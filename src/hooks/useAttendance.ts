import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent';

export interface AttendanceSubject {
  id: string;
  subject_name: string;
  subject_code: string;
  is_lab: boolean;
}

export interface AttendanceLogRow {
  id: string;
  subject_id: string;
  date: string; // 'YYYY-MM-DD'
  status: AttendanceStatus;
}

export interface SubjectSummary {
  subject_id: string;
  total_held: number; // present + absent
  attended: number;   // present only
}

export type AttendanceZone = 'safe' | 'borderline' | 'danger';

export interface SubjectStats extends SubjectSummary {
  pct: number;
  zone: AttendanceZone;
  canMiss: number;    // classes that can still be skipped while staying >= 75%
  needAttend: number; // consecutive classes needed to get back to >= 75%
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ATTENDANCE_THRESHOLD = 75;

export const STATUS_META: Record<AttendanceStatus, { label: string; icon: string }> = {
  present: { label: 'Present', icon: '✅' },
  absent:  { label: 'Absent',  icon: '❌' },
};

export const ZONE_COLORS: Record<AttendanceZone, {
  text: string; stroke: string; chipBg: string; barBg: string; trackBg: string;
}> = {
  safe:       { text: 'text-emerald-600', stroke: '#10b981', chipBg: 'bg-emerald-50 border-emerald-200 text-emerald-700', barBg: 'bg-emerald-500', trackBg: 'bg-emerald-100' },
  borderline: { text: 'text-amber-600',   stroke: '#f59e0b', chipBg: 'bg-amber-50 border-amber-200 text-amber-700',     barBg: 'bg-amber-500',   trackBg: 'bg-amber-100' },
  danger:     { text: 'text-red-600',     stroke: '#ef4444', chipBg: 'bg-red-50 border-red-200 text-red-700',           barBg: 'bg-red-500',     trackBg: 'bg-red-100' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toLocalDateKey(new Date());
}

/**
 * Core attendance math.
 * - pct      = attended / total_held * 100 (cancelled never counts)
 * - zone     : red < 75, yellow 75–80 (borderline), green > 80
 * - canMiss  = max classes skip-able keeping pct >= 75  → floor((4a − 3h) / 3)
 * - needAttend = consecutive presents to reach 75%      → ceil(3h − 4a)
 */
export function computeStats(s: SubjectSummary): SubjectStats {
  const held = s.total_held;
  const att = s.attended;
  if (held <= 0) {
    return { ...s, total_held: held, attended: att, pct: 0, zone: 'borderline', canMiss: 0, needAttend: 0 };
  }
  const pct = Math.round((att / held) * 1000) / 10;
  let zone: AttendanceZone;
  if (pct < ATTENDANCE_THRESHOLD) zone = 'danger';
  else if (pct <= 80) zone = 'borderline';
  else zone = 'safe';

  const canMiss = Math.max(0, Math.floor((4 * att - 3 * held) / 3));
  const needAttend = pct >= ATTENDANCE_THRESHOLD ? 0 : Math.max(1, Math.ceil(3 * held - 4 * att));
  return { ...s, total_held: held, attended: att, pct, zone, canMiss, needAttend };
}

/** Overall percentage across all subjects (weighted by held classes). */
export function computeOverall(stats: SubjectStats[]): { pct: number; zone: AttendanceZone } {
  const held = stats.reduce((n, s) => n + s.total_held, 0);
  const att = stats.reduce((n, s) => n + s.attended, 0);
  if (held === 0) return { pct: 0, zone: 'borderline' };
  const pct = Math.round((att / held) * 1000) / 10;
  const zone: AttendanceZone = pct < ATTENDANCE_THRESHOLD ? 'danger' : pct <= 80 ? 'borderline' : 'safe';
  return { pct, zone };
}

// ─── Data access ─────────────────────────────────────────────────────────────

export async function fetchSemesterSubjects(branchId: string, semester: number): Promise<AttendanceSubject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, subject_name, subject_code, is_lab')
    .eq('branch_id', branchId)
    .eq('semester', semester)
    .order('subject_code');
  if (error) throw error;
  return (data ?? []) as AttendanceSubject[];
}

/** Aggregated per-subject counts via DB RPC (efficient grouping on load). Scoped to branch + semester. */
export async function fetchAttendanceSummary(userId: string, branchId: string, semester: number): Promise<Map<string, SubjectSummary>> {
  const { data, error } = await supabase.rpc('get_attendance_summary', {
    p_user_id: userId,
    p_branch_id: branchId,
    p_semester: semester,
  });
  const map = new Map<string, SubjectSummary>();
  if (!error && Array.isArray(data)) {
    for (const row of data as { subject_id: string; total_held: number | string; attended: number | string; cancelled?: number | string }[]) {
      map.set(row.subject_id, {
        subject_id: row.subject_id,
        total_held: Number(row.total_held),
        attended: Number(row.attended),
      });
    }
  }
  return map;
}

/** Full log list — powers the history view and "already marked today" state. Scoped to branch + semester. */
export async function fetchAttendanceLogs(userId: string, branchId: string, semester: number, limit = 500): Promise<AttendanceLogRow[]> {
  // First get subject IDs for this branch+semester
  const { data: subRows, error: subErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('branch_id', branchId)
    .eq('semester', semester);
  if (subErr) throw subErr;
  const subjectIds = (subRows ?? []).map((s: { id: string }) => s.id);
  if (subjectIds.length === 0) return [];

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id, subject_id, date, status')
    .eq('user_id', userId)
    .in('subject_id', subjectIds)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AttendanceLogRow[];
}

/**
 * Insert or flip today's mark. The unique (user_id, subject_id, date)
 * constraint makes this a safe upsert — no duplicate rows possible.
 */
export async function markAttendance(
  userId: string,
  subjectId: string,
  dateKey: string,
  status: AttendanceStatus,
): Promise<void> {
  const { error } = await supabase.from('attendance_logs').upsert(
    { user_id: userId, subject_id: subjectId, date: dateKey, status },
    { onConflict: 'user_id,subject_id,date' },
  );
  if (error) throw error;
}

/**
 * Remove attendance log for a given subject+date (clear/reset).
 */
export async function clearAttendance(
  userId: string,
  subjectId: string,
  dateKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('attendance_logs')
    .delete()
    .eq('user_id', userId)
    .eq('subject_id', subjectId)
    .eq('date', dateKey);
  if (error) throw error;
}

/**
 * Add extra class attendance: inserts `count` log rows for the given subject,
 * date, and status. Uses a loop upsert with distinct timestamps appended to the
 * date string to satisfy the unique (user_id, subject_id, date) constraint.
 */
export async function addExtraClass(
  userId: string,
  subjectId: string,
  dateKey: string,
  status: AttendanceStatus,
  count: number,
): Promise<void> {
  const rows = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    subject_id: subjectId,
    date: `${dateKey}_${i + 1}`,
    status,
  }));
  const { error } = await supabase.from('attendance_logs').upsert(rows, {
    onConflict: 'user_id,subject_id,date',
  });
  if (error) throw error;
}
