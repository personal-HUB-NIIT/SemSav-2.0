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
  class_count: number;
  is_extra: boolean;
}

export interface SubjectSummary {
  subject_id: string;
  total_held: number; // sum of class_count (present + absent)
  attended: number;   // sum of class_count where present
}

export type AttendanceZone = 'safe' | 'borderline' | 'danger';

export interface SubjectStats extends SubjectSummary {
  pct: number;
  zone: AttendanceZone;
  canMiss: number;
  needAttend: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ATTENDANCE_THRESHOLD = 75;

export const STATUS_META: Record<AttendanceStatus, { label: string }> = {
  present: { label: 'Present' },
  absent:  { label: 'Absent' },
};

export const ZONE_COLORS: Record<AttendanceZone, {
  text: string; stroke: string; chipBg: string; barBg: string; trackBg: string;
}> = {
  safe:       { text: 'text-emerald-400', stroke: '#10b981', chipBg: 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400', barBg: 'bg-emerald-500', trackBg: 'bg-emerald-500/20' },
  borderline: { text: 'text-amber-400',   stroke: '#f59e0b', chipBg: 'bg-amber-500/15 border border-amber-500/25 text-amber-400',     barBg: 'bg-amber-500',   trackBg: 'bg-amber-500/20' },
  danger:     { text: 'text-red-400',     stroke: '#ef4444', chipBg: 'bg-red-500/15 border border-red-500/25 text-red-400',           barBg: 'bg-red-500',     trackBg: 'bg-red-500/20' },
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

export async function fetchAttendanceSummary(userId: string, branchId: string, semester: number): Promise<Map<string, SubjectSummary>> {
  try {
    const { data, error } = await supabase.rpc('get_attendance_summary', {
      p_user_id: userId,
      p_branch_id: branchId,
      p_semester: semester,
    });
    if (error) throw error;
    const map = new Map<string, SubjectSummary>();
    if (Array.isArray(data)) {
      for (const row of data as { subject_id: string; total_held: number | string; attended: number | string }[]) {
        map.set(row.subject_id, {
          subject_id: row.subject_id,
          total_held: Number(row.total_held),
          attended: Number(row.attended),
        });
      }
    }
    return map;
  } catch {
    const logs = await fetchAttendanceLogs(userId, branchId, semester, 2000);
    const map = new Map<string, SubjectSummary>();
    for (const l of logs) {
      const cur = map.get(l.subject_id) ?? { subject_id: l.subject_id, total_held: 0, attended: 0 };
      if (l.status === 'present' || l.status === 'absent') cur.total_held += l.class_count;
      if (l.status === 'present') cur.attended += l.class_count;
      map.set(l.subject_id, cur);
    }
    return map;
  }
}

export async function fetchAttendanceLogs(userId: string, branchId: string, semester: number, limit = 500): Promise<AttendanceLogRow[]> {
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
    .select('id, subject_id, date, status, class_count, is_extra')
    .eq('user_id', userId)
    .in('subject_id', subjectIds)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AttendanceLogRow[];
}

/** Upsert today's regular class mark (class_count=1, is_extra=false).
 *  Deletes any existing regular entry first, then inserts — partial unique
 *  index prevents duplicates but can't be used as onConflict target. */
export async function markAttendance(
  userId: string,
  subjectId: string,
  dateKey: string,
  status: AttendanceStatus,
): Promise<void> {
  // Delete existing regular entry for this subject+date
  await supabase
    .from('attendance_logs')
    .delete()
    .eq('user_id', userId)
    .eq('subject_id', subjectId)
    .eq('date', dateKey)
    .eq('is_extra', false);

  // Insert new regular entry
  const { error } = await supabase.from('attendance_logs').insert({
    user_id: userId,
    subject_id: subjectId,
    date: dateKey,
    status,
    class_count: 1,
    is_extra: false,
  });
  if (error) throw error;
}

/** Delete today's regular entry (is_extra=false) for a subject. */
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
    .eq('date', dateKey)
    .eq('is_extra', false);
  if (error) throw error;
}

/** Insert an extra class entry (is_extra=true, class_count=N). */
export async function addExtraClass(
  userId: string,
  subjectId: string,
  dateKey: string,
  status: AttendanceStatus,
  count: number,
): Promise<void> {
  const { error } = await supabase.from('attendance_logs').insert({
    user_id: userId,
    subject_id: subjectId,
    date: dateKey,
    status,
    class_count: count,
    is_extra: true,
  });
  if (error) throw error;
}
