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
