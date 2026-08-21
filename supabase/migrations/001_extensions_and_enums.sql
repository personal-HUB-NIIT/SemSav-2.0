-- ============================================================
-- Migration 001: Extensions & Enum Types
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enum Types
create type user_role as enum ('STUDENT', 'SUPER_ADMIN');
create type upload_category as enum ('NOTES', 'ASSIGNMENT', 'TEST');
create type upload_status as enum ('UNVERIFIED', 'VERIFIED', 'PURGED');
create type vote_type as enum ('UP', 'DOWN');
create type test_type as enum ('MID_SEM', 'QUIZ', 'LAB_TEST', 'VIVA', 'RESCHEDULED');
create type admin_action as enum (
  'BRANCH_CREATE', 'BRANCH_UPDATE', 'SUBJECT_SEED',
  'CONTENT_PURGE', 'ACCOUNT_BAN', 'ACCOUNT_UNBAN',
  'CREDENTIAL_RESET', 'DOMAIN_WHITELIST_UPDATE'
);
