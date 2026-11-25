-- supabase_upgrade_4.sql  —  "What's new" announcements (the bell in the top bar)
-- Run ONCE in Supabase → SQL Editor. Safe to run twice. The app still works before it is run (the bell then shows the built-in release notes only).

create table if not exists ecoscope_announcements (
  id          bigserial primary key,
  title       text not null,
  body        text not null default '',
  kind        text not null default 'update',   -- update | upgrade | maintenance | notice
  version     text,
  published   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists ecoscope_announcements_time on ecoscope_announcements (created_at desc) where published;

-- the server uses the service-role key; RLS on with no policies keeps the table closed to the public anon key
alter table ecoscope_announcements enable row level security;
