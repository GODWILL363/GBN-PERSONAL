-- supabase_upgrade_3.sql  —  password reset, My snapshots, project chat
-- Run ONCE in Supabase → SQL Editor, BEFORE deploying this EcoScope update. Safe to run twice.

-- forgotten password: only a hash of the emailed token is stored, with its expiry time
alter table ecoscope_users add column if not exists reset_token_hash text;
alter table ecoscope_users add column if not exists reset_expires timestamptz;
create index if not exists ecoscope_users_reset_token on ecoscope_users (reset_token_hash) where reset_token_hash is not null;

-- My snapshots: chart pictures a user saves (bytes in Supabase Storage, bucket "ecoscope-vault")
create table if not exists ecoscope_snapshots (
  id           text primary key,
  username     text not null,
  title        text not null,
  mime         text not null default 'image/png',
  size_bytes   integer not null default 0,
  meta         jsonb,
  storage_path text,
  data         text,
  created_at   timestamptz not null default now()
);
create index if not exists ecoscope_snapshots_user on ecoscope_snapshots (username, created_at desc);

-- project chat: messages between the people who share a project
create table if not exists ecoscope_project_messages (
  id          bigserial primary key,
  project_id  text not null,
  username    text not null,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted     boolean not null default false
);
create index if not exists ecoscope_project_messages_project on ecoscope_project_messages (project_id, id);

-- the server uses the service key, so row level security on these tables only blocks outside access
alter table ecoscope_snapshots        enable row level security;
alter table ecoscope_project_messages enable row level security;
