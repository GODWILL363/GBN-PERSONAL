-- supabase_upgrade_2.sql  —  invitations and file storage
-- Run ONCE in Supabase → SQL Editor, BEFORE deploying this EcoScope update. Safe to run twice.

-- invitations: the one-time token sent in the invite link
alter table ecoscope_users add column if not exists invite_token text;
create index if not exists ecoscope_users_invite_token on ecoscope_users (invite_token) where invite_token is not null;

-- Vault documents and admin storage files: bytes move to Supabase Storage; the row keeps the path
alter table ecoscope_library_files   add column if not exists storage_path text;
alter table ecoscope_library_storage add column if not exists storage_path text;

-- the server creates the private bucket "ecoscope-vault" on first upload; nothing else to set up
