-- ============================================================
-- Migration 021: Correct CME505 (Financial Mathematics) faculty name
-- Routine correction: "Dr. Birojit Das" -> "Dr. Debashish Das"
-- ============================================================

update public.class_schedule
set teacher_name = 'Dr. Debashish Das'
where subject_code = 'CME505'
  and teacher_name = 'Dr. Birojit Das';
