create table if not exists bond_yields (
  date date not null,
  instrument text not null,
  yield_pct numeric not null,
  primary key (date, instrument)
);

create table if not exists daily_summary (
  date date primary key,
  summary_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists email_send_log (
  id bigint generated always as identity primary key,
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_send_log_ip_created_idx
  on email_send_log (ip_address, created_at);

-- The app only ever accesses these tables via the Supabase service-role
-- client (server-side only), which bypasses RLS. Enabling RLS here with no
-- policies ensures the anon/authenticated roles have zero access if the
-- anon key were ever exposed to a client-side query against these tables.
alter table bond_yields enable row level security;
alter table daily_summary enable row level security;
alter table email_send_log enable row level security;
