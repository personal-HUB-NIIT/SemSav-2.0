-- ============================================================
-- Migration 034: Retain uploads on user deletion + Fix admin delete
-- ============================================================
-- Phase 1:
-- 1. Change uploads.user_id FK from ON DELETE CASCADE -> SET NULL
--    so user deletion orphans content instead of purging it.
-- 2. Fix missing GRANT DELETE on uploads (RLS policy exists but table privilege missing)
-- 3. Allow SUPER_ADMIN to delete any storage object in semsav-files
-- 4. Update delete_user_account() to retain uploads (rely on SET NULL)
-- ============================================================

-- ─── 1. Grants: admin needs DELETE on uploads ───────────────────────────────
grant delete on public.uploads to authenticated;
grant delete on public.uploads to anon;

-- Content reports and study materials are cascaded from uploads; ensure grants exist
grant delete on public.content_reports to authenticated;
grant delete on public.study_materials to authenticated;

-- ─── 2. Make uploads.user_id nullable and change FK to SET NULL ───────────
-- Already nullable check: current schema is NOT NULL, so we must drop NOT NULL first.

-- Drop NOT NULL
alter table public.uploads alter column user_id drop not null;

-- Drop existing FK (name is normally uploads_user_id_fkey)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.uploads'::regclass
    and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.uploads'::regclass and attname = 'user_id')];
  if cname is not null then
    execute format('alter table public.uploads drop constraint %I', cname);
  end if;
end $$;

-- Recreate with SET NULL
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.uploads'::regclass
      and conname = 'uploads_user_id_fkey'
  ) then
    alter table public.uploads
      add constraint uploads_user_id_fkey
      foreign key (user_id) references public.users(id) on delete set null;
  end if;
end $$;

comment on constraint uploads_user_id_fkey on public.uploads is 'On user deletion, orphan upload instead of cascade delete';

-- Also fix study_materials.uploader_id to SET NULL (retain verified notes)
do $$
declare
  cname text;
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='study_materials') then
    execute 'alter table public.study_materials alter column uploader_id drop not null';
    select conname into cname
    from pg_constraint
    where conrelid = 'public.study_materials'::regclass
      and contype = 'f'
      and conkey = array[(select attnum from pg_attribute where attrelid='public.study_materials'::regclass and attname='uploader_id')];
    if cname is not null then
      execute format('alter table public.study_materials drop constraint %I', cname);
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.study_materials'::regclass and conname='study_materials_uploader_id_fkey') then
      execute 'alter table public.study_materials add constraint study_materials_uploader_id_fkey foreign key (uploader_id) references public.users(id) on delete set null';
    end if;
  end if;
end $$;

-- ─── 3. Storage: allow SUPER_ADMIN to delete any file in semsav-files ─────
-- Existing policy only allows owners to delete own file, which blocks admin purge.
drop policy if exists "Admins can delete any file in semsav-files" on storage.objects;
create policy "Admins can delete any file in semsav-files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'semsav-files'
  and exists (
    select 1 from public.users
    where auth_id = auth.uid() and role = 'SUPER_ADMIN'
  )
);

-- Also ensure admin can read any file (implicit via public, but keep for completeness)
drop policy if exists "Admins can read any file in semsav-files" on storage.objects;
create policy "Admins can read any file in semsav-files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'semsav-files'
  and exists (
    select 1 from public.users
    where auth_id = auth.uid() and role = 'SUPER_ADMIN'
  )
);

-- ─── 4. Update delete_user_account() to retain uploads ────────────────────
-- Previously deleted storage.objects for the user, which would orphan retained uploads.
-- Now we only clean tables that truly must be cleaned (no cascade), and let
-- uploads.user_id become NULL via SET NULL. Storage files for uploads are kept.

create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_id uuid;
begin
  if p_user_id is null or auth.uid() is null or p_user_id != auth.uid() then
    raise exception 'You can only delete your own account';
  end if;

  select id into v_public_id from public.users where auth_id = p_user_id;

  -- Clean tables referencing public.users without cascade
  delete from public.admin_logs   where admin_id  = v_public_id;
  delete from public.ai_usage_log where user_id   = v_public_id;

  -- Best-effort: remove avatar from storage (not upload files!)
  begin
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = p_user_id::text;
  exception when others then null;
  end;

  -- Deleting auth.users cascades to public.users and then:
  --   uploads.user_id -> SET NULL (retained as orphaned)
  --   votes, user_tasks, admin_credentials, action_log -> CASCADE
  --   attendance_logs, queue_votes, verification_queue -> CASCADE (reference auth.users)
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_user_account(uuid) from anon;
grant execute on function public.delete_user_account(uuid) to authenticated;

-- ─── 5. Ensure uploads delete policy still intact (recreate idempotently) ──
drop policy if exists uploads_delete_admin_only on public.uploads;
create policy uploads_delete_admin_only on public.uploads
  for delete using (auth_role() = 'SUPER_ADMIN');

-- Refresh grants comment
comment on table public.uploads is 'user_id is SET NULL on user deletion to retain content as anonymous';

notify pgrst, 'reload schema';
