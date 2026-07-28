create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',
  confirm_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_subscribers_token_idx
  on email_subscribers (confirm_token);

create table if not exists holidays (
  date date primary key,
  name text not null
);

-- The app only ever accesses these tables via the Supabase service-role
-- client (server-side only), which bypasses RLS. Enabling RLS here with no
-- policies ensures the anon/authenticated roles have zero access if the
-- anon key were ever exposed to a client-side query against these tables.
alter table email_subscribers enable row level security;
alter table holidays enable row level security;
