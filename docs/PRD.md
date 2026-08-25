# PRD — 국고채·통안채·CD 금리 대시보드

> 2026-08-25 기준 현행화. 지표 데이터/발송 로직뿐 아니라 실제 운영 Supabase DB에 필요한 테이블이 실재하는지까지 점검·반영했다.

## 지표(INSTRUMENTS)

국고채 1/2/3/5/10/20년, 통안증권 1년, CD금리 91일 — 총 8개. ECOS `817Y002`(시장금리, 일별)에서 지표별 `ecosItemCode1`로 조회한다 ([lib/instruments.ts](../lib/instruments.ts)).

## 일별 금리 수집 (`/api/cron/update-rates`)

- Vercel Cron이 매일 KST 16:10(`vercel.json`의 `"10 7 * * *"`, UTC 기준)에 그날치를 조회해 `bond_yields`(PK: `date, instrument`)에 upsert한다. 이미 확인된 지표는 재조회하지 않는다.
- `?date=YYYYMMDD` 쿼리로 과거 특정 날짜를 수동 재조회할 수 있다(정규식 검증, 형식이 아니면 오늘치로 대체). 과거 데이터 누락 시 이 파라미터로 백필한다.
- **수동 백필 절차**: `.github/workflows/retry-update-rates.yml`을 `workflow_dispatch`로 직접 실행하면서 입력값 `date`(YYYYMMDD), `cron_secret`/`site_url`(비우면 저장된 GitHub Actions 시크릿 `CRON_SECRET`/`SITE_URL` 사용)을 지정하면, 지정한 날짜로 `/api/cron/update-rates`를 호출해 빠진 지표만 채운다. 정기 스케줄 실행(입력 없음)은 기존과 동일하게 오늘치를 대상으로 한다.

## 다이제스트 이메일 발송 규칙

- **발송 트리거**: `/api/cron/update-rates`가 그날(KST) `INSTRUMENTS` **전부**를 확인했을 때만 `/api/cron/send-digest`를 호출한다. 일부 지표만 확인된 상태에서는 발송하지 않는다.
  - 과거 버그: "오늘치 데이터가 하나라도 있으면" 발송하는 조건이었고, CD금리 등 ECOS 갱신이 늦는 지표가 빠진 채 부분 발송되는 문제가 있었다. `hasAnyData` → 전 지표 확인(`allConfirmed`) 조건으로 수정함 ([app/api/cron/update-rates/route.ts](../app/api/cron/update-rates/route.ts)).
- **재시도**: Vercel Hobby 플랜은 크론이 하루 1회뿐이라 자체 재시도가 없다. GitHub Actions 워크플로(`.github/workflows/retry-update-rates.yml`)가 KST 16:15~18:55 동안 5분 간격으로 `/api/cron/update-rates`를 재호출해, 아직 확인되지 않은 지표만 다시 조회하고 전부 확인되면 그때 발송을 트리거한다.
- **중복 발송 방지**: 발송 직전 `digest_dispatch_log` 테이블(`date` PK)에 그날 날짜를 원자적으로 선점(upsert ... ignoreDuplicates)한다. 이미 선점된 날짜면 `skipped-already-sent`로 응답하고 재발송하지 않는다. `send-digest` 호출 자체가 실패하면 선점을 즉시 해제해 다음 재시도가 다시 시도할 수 있게 한다.
- **공휴일 스킵**: `send-digest`는 `lib/holidays.ts`의 `isHoliday()`로 `kr_holidays` 테이블을 조회해 당일이 공휴일이면 발송을 건너뛴다. 다만 `send-digest`는 `update-rates`가 8개 지표 전부 확인했을 때만 호출되고, 실제 공휴일엔 ECOS 자체가 데이터를 발행하지 않아 "전부 확인" 조건이 성립하지 않으므로, 이 스킵 로직이 실제로 발동하는 경우는 드물다(주로 평일인데 시장이 열리지 않는 예외적 케이스 대비용).
- **`digestStatus` 응답값**: `triggered` | `failed` | `skipped-no-data`(오늘치 지표가 아예 없음) | `skipped-incomplete`(일부 지표 미확인) | `skipped-no-url`(사이트 URL 미설정) | `skipped-already-sent`(중복 방지로 스킵).

## 운영 DB 현황 (Supabase `project2` / `jmddxnphylrkzcctouja`)

| 용도 | 실제 테이블명 | 비고 |
| --- | --- | --- |
| 금리 시계열 | `bond_yields` | PK `(date, instrument)` |
| 이메일 구독자 | `email_subscribers` | |
| 구독 확인/해지 요청 rate limit | `email_send_log` | |
| 공휴일 목록 | `kr_holidays` | 컬럼 `date`, `name`. **주의**: `supabase/migrations/0002_email_subscribers.sql`은 `holidays`라는 이름으로 테이블을 만들지만, 실제 운영 DB의 테이블명은 `kr_holidays`다. 코드(`lib/holidays.ts`)는 `kr_holidays`를 조회하도록 맞춰져 있다(2026-08-25 수정, PR #12). 마이그레이션 파일 자체는 정리되지 않은 상태로 남아있어 로컬에서 마이그레이션을 새로 적용할 때 혼동하지 않도록 주의.
| 다이제스트 중복 발송 방지 | `digest_dispatch_log` | `supabase/migrations/0004_digest_dispatch_log.sql`에 정의돼 있었으나 **운영 DB에 마이그레이션이 적용된 적이 없어 테이블이 없었고, 이로 인해 8개 지표가 전부 확인돼도 발송이 항상 `failed`로 조용히 실패하던 활성 버그가 있었다.** 2026-08-25 운영 DB에 직접 적용해 해결함.

`list_migrations` 기준으로 이 프로젝트는 Supabase 마이그레이션 이력 추적을 쓰지 않고(빈 배열) 테이블들이 수시로 수동 SQL 실행으로 만들어져 왔다. `supabase/migrations/*.sql` 파일과 운영 DB 실제 스키마가 어긋날 수 있으니, 스키마를 다루는 작업 전에는 항상 운영 DB를 직접 조회(`list_tables`/`information_schema`)해서 확인할 것.

## 관련 문서

- [docs/superpowers/specs/2026-07-28-recurring-email-digest-design.md](superpowers/specs/2026-07-28-recurring-email-digest-design.md) — 구독/확인/해지 및 `send-digest` 발송 로직 원설계
- [docs/superpowers/plans/2026-07-28-recurring-email-digest.md](superpowers/plans/2026-07-28-recurring-email-digest.md) — 구현 계획
