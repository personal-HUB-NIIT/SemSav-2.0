-- Migration 011: Supabase Storage bucket + policies for file uploads
-- Run this in the Supabase SQL Editor.

-- 1. Create the storage bucket (public, so files are accessible via URL)
-- NOTE: You can also do this in the Supabase Dashboard → Storage → New Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'semsav-files',
  'semsav-files',
  true,
  20971520, -- 20 MB in bytes
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip'
  ]
)
on conflict (id) do nothing;

-- 2. Allow authenticated users to upload files to their own folder
create policy "Authenticated users can upload files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'semsav-files'
  and (storage.foldername(name))[1] = 'uploads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- 3. Allow anyone to read/download files (bucket is public anyway)
create policy "Public read access for semsav files"
on storage.objects
for select
to public
using (bucket_id = 'semsav-files');

-- 4. Allow users to delete only their own files
create policy "Users can delete their own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'semsav-files'
  and (storage.foldername(name))[2] = auth.uid()::text
);
