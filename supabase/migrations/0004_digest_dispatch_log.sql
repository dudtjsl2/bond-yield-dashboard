-- 하루에 다이제스트 이메일이 두 번 이상 발송되는 것을 막기 위한 원자적 클레임 테이블.
-- update-rates가 전 지표 확인 후 발송을 시도하기 직전에 date를 선점(upsert ... on conflict do nothing)하고,
-- 실제 발송이 실패하면 클레임을 삭제해 다음 재시도(5분 간격 GitHub Actions)가 다시 시도할 수 있게 한다.
create table if not exists digest_dispatch_log (
  date date primary key,
  dispatched_at timestamptz not null default now()
);

alter table digest_dispatch_log enable row level security;
