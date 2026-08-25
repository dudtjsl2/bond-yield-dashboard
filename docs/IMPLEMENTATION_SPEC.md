# 구현 명세서 — 국고채·통안채·CD 금리 대시보드

> 2026-08-25 기준. 이 문서 하나만으로 현재 배포된 프로그램을 처음부터 동일하게 재구현할 수 있도록, 기술 스택·디렉터리 구조·DB 스키마·API 로직·프론트엔드 컴포넌트·크론/배포 설정을 전부 담았다. `docs/PRD.md`는 다이제스트 발송 규칙과 운영 DB 이슈 요약을 다루고, 이 문서는 "처음부터 다시 만든다면"의 관점에서 전체를 다룬다.

## 1. 개요

한국은행 ECOS(경제통계시스템) API에서 국고채·통안증권·CD 금리를 매일 수집해 Supabase에 저장하고, 웹 대시보드(차트)로 보여주며, 엑셀 다운로드·1회성 이메일 발송·매영업일 자동 이메일 다이제스트 구독 기능을 제공하는 Next.js 앱.

## 2. 기술 스택

| 구분 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 스타일 | Tailwind CSS v4 (CSS-first config, `@theme inline`), `next-themes`(다크모드) |
| 차트 | `recharts` |
| 엑셀 생성 | `xlsx` (SheetJS) — 워크북 **작성** 전용, 업로드 파싱은 하지 않음(취약점 회피) |
| 이메일 발송 | `nodemailer` + Gmail SMTP(앱 비밀번호) |
| DB | Supabase(Postgres), 서버에서 `@supabase/supabase-js`의 서비스 롤 키로만 접근 |
| 외부 데이터 소스 | 한국은행 ECOS Open API (`https://ecos.bok.or.kr/api/StatisticSearch/...`) |
| 배포 | Vercel (Hobby 플랜, 크론 하루 1회 제한) |
| 크론 보완 | GitHub Actions (`.github/workflows/retry-update-rates.yml`) |
| 테스트 | Vitest + Testing Library + jsdom |

`package.json` 핵심 의존성:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.110.8",
    "next": "16.2.12",
    "next-themes": "^0.4.6",
    "nodemailer": "^9.0.3",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.10.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^20",
    "@types/nodemailer": "^8.0.1",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.4",
    "@vitest/coverage-v8": "^4.1.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.12",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.10"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## 3. 디렉터리 구조

```
app/
  layout.tsx              # 루트 레이아웃, 폰트, ThemeProvider
  page.tsx                # 대시보드 페이지 (서버 컴포넌트, force-dynamic)
  error.tsx                # 전역 에러 바운더리 (client)
  globals.css              # Tailwind v4 + 라이트/다크 색상 토큰
  api/
    rates/route.ts                      # GET: 대시보드용 시계열 조회
    export/excel/route.ts               # GET: 엑셀 다운로드
    export/email/route.ts               # POST: 1회성 이메일 발송
    subscribe/route.ts                  # POST: 구독 신청(확인코드 발송)
    subscribe/confirm-code/route.ts     # POST: 6자리 코드로 구독 확정
    unsubscribe/email/route.ts          # POST: 이메일만으로 구독 해지
    cron/update-rates/route.ts          # GET(크론): 오늘치(또는 지정일) 조회+저장, 다이제스트 트리거
    cron/send-digest/route.ts           # GET(크론이 내부 호출): 확정 구독자에게 발송
    cron/backfill/route.ts              # GET(수동 1회성): 과거 구간 대량 백필
components/
  Dashboard.tsx            # 최상위 클라이언트 컴포넌트, 상태 관리
  InstrumentSelector.tsx   # 지표 다중 선택 pill 버튼
  PeriodSelector.tsx       # 기간(1개월/1년/5년/전체) 버튼
  TrendChart.tsx           # recharts 라인 차트
  ThemeToggle.tsx          # 다크모드 토글 버튼
  ExportPanel.tsx          # 엑셀 다운로드 링크 + 이메일 발송 폼
  SubscribePanel.tsx       # 구독 신청/코드 확인/해지 폼
lib/
  instruments.ts           # 지표 정의(8개) + ECOS 코드 매핑
  ecos.ts                  # ECOS API 호출(단일 날짜 / 구간)
  supabase.ts              # 서비스 롤 Supabase 클라이언트(싱글턴)
  rates.ts                 # 시계열 조회, 기간 파싱, 최신값 요약
  excel.ts                 # 워크북 생성(pivot: 날짜×지표)
  gmail.ts                 # nodemailer 발송 3종(1회성/구독확인/다이제스트)
  subscribers.ts           # 구독자 CRUD(신청/확정/해지/목록)
  rateLimit.ts             # IP 기준 시간당 발송 rate limit
  holidays.ts              # 공휴일 조회(kr_holidays)
supabase/migrations/       # SQL 마이그레이션(순서대로 실행)
.github/workflows/
  retry-update-rates.yml   # 5분 간격 재시도 + 수동 백필용 workflow_dispatch
vercel.json                 # Vercel Cron 설정
docs/PRD.md                 # 다이제스트 규칙 + 운영 DB 현황 요약
```

## 4. 환경 변수

| 변수명 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (현재 코드에서는 서버가 항상 서비스 롤 키를 쓰므로 직접 참조되진 않지만, 배포 문서 관례상 등록) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 서비스 롤 키. **절대 클라이언트에 노출 금지** |
| `ECOS_API_KEY` | 한국은행 ECOS Open API 인증키 |
| `GMAIL_USER` | 발신 Gmail 주소 |
| `GMAIL_APP_PASSWORD` | Gmail 앱 비밀번호(일반 로그인 비밀번호 아님, 2단계 인증 켜고 발급) |
| `CRON_SECRET` | 크론 라우트 인증용 임의 문자열. 요청 헤더 `Authorization: Bearer <CRON_SECRET>`와 일치해야 통과 |
| `NEXT_PUBLIC_SITE_URL` | (선택) 다이제스트 메일 본문 링크 및 `update-rates`→`send-digest` 내부 호출에 사용. 미설정 시 Vercel이 주입하는 `VERCEL_URL`로 대체 |

GitHub Actions 저장소 시크릿(재시도 워크플로용): `CRON_SECRET`(Vercel과 동일 값), `SITE_URL`(배포 도메인, 예: `https://xxx.vercel.app`).

## 5. 데이터베이스 스키마 (Supabase / Postgres)

> **중요**: 아래는 리포의 `supabase/migrations/*.sql` 파일 순서와, 실제 운영 DB에 맞춰 바로잡은 최종 스키마다. `0002_email_subscribers.sql` 원본은 `holidays`라는 테이블명을 쓰지만, 애플리케이션 코드(`lib/holidays.ts`)와 실제 운영 DB는 **`kr_holidays`**를 쓴다. 처음부터 새로 만든다면 아래처럼 `kr_holidays`로 통일해서 만들 것 (`0001`, `0003`, `0004`는 원본 그대로 유효).

### 0001_init.sql
```sql
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

-- 앱은 이 테이블들을 서버 사이드 서비스 롤 클라이언트로만 접근한다(RLS 우회).
-- RLS를 켜고 정책을 두지 않으면, anon 키가 클라이언트에 노출되더라도
-- anon/authenticated 역할은 이 테이블에 전혀 접근할 수 없다.
alter table bond_yields enable row level security;
alter table daily_summary enable row level security;
alter table email_send_log enable row level security;
```

### 0002_email_subscribers.sql (테이블명을 `kr_holidays`로 정정해서 적용)
```sql
create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',
  confirm_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_subscribers_token_idx
  on email_subscribers (confirm_token);

create table if not exists kr_holidays (
  date date primary key,
  name text not null
);

alter table email_subscribers enable row level security;
alter table kr_holidays enable row level security;
```

### 0003_subscriber_short_code.sql
```sql
-- 회사 메일 보안 게이트웨이가 확인/해지 링크를 재작성·차단하는 경우(Safe Links 등)의
-- 대안. 구독자가 링크 대신 사이트에 숫자 코드를 직접 입력해 확인/해지할 수 있게 한다.
alter table email_subscribers add column if not exists short_code text;
```

### 0004_digest_dispatch_log.sql
```sql
-- 하루에 다이제스트 이메일이 두 번 이상 발송되는 것을 막기 위한 원자적 클레임 테이블.
-- update-rates가 전 지표 확인 후 발송을 시도하기 직전에 date를 선점(upsert ... on conflict do nothing)하고,
-- 실제 발송이 실패하면 클레임을 삭제해 다음 재시도(5분 간격 GitHub Actions)가 다시 시도할 수 있게 한다.
create table if not exists digest_dispatch_log (
  date date primary key,
  dispatched_at timestamptz not null default now()
);

alter table digest_dispatch_log enable row level security;
```

### 테이블 요약

| 테이블 | 컬럼 | 용도 |
| --- | --- | --- |
| `bond_yields` | `date`(PK 일부), `instrument`(PK 일부), `yield_pct` | 지표별 일별 금리. `(date, instrument)` 복합 PK로 upsert 시 중복 방지 |
| `daily_summary` | `date`(PK), `summary_text`, `created_at` | (현재 코드에서 실제 사용처 없음 — 과거 설계 잔재로 보임, 신규 구현 시 생략 가능) |
| `email_send_log` | `id`, `ip_address`, `created_at` | IP당 시간당 5회 발송 제한(구독 신청 + 1회성 엑셀 이메일 공용) |
| `email_subscribers` | `id`, `email`(unique), `status`(`pending`/`confirmed`/`unsubscribed`), `confirm_token`(레거시, 계속 채움), `short_code`, `created_at` | 다이제스트 구독자 |
| `kr_holidays` | `date`(PK), `name` | 공휴일 목록(수동 입력, 배포 직후 비어있음) |
| `digest_dispatch_log` | `date`(PK), `dispatched_at` | 하루 1회 다이제스트 발송 원자적 선점 |

모든 테이블은 RLS를 켜고 정책을 두지 않는다 — 서버의 서비스 롤 클라이언트만 접근 가능.

## 6. 지표 정의 (`lib/instruments.ts`)

```ts
export type Instrument = {
  code: string
  label: string
  ecosStatCode: string
  ecosItemCode1: string
}

export const INSTRUMENTS: Instrument[] = [
  { code: 'treasury_1y', label: '국고채 1년', ecosStatCode: '817Y002', ecosItemCode1: '010190000' },
  { code: 'treasury_2y', label: '국고채 2년', ecosStatCode: '817Y002', ecosItemCode1: '010195000' },
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '817Y002', ecosItemCode1: '010200000' },
  { code: 'treasury_5y', label: '국고채 5년', ecosStatCode: '817Y002', ecosItemCode1: '010200001' },
  { code: 'treasury_10y', label: '국고채 10년', ecosStatCode: '817Y002', ecosItemCode1: '010210000' },
  { code: 'treasury_20y', label: '국고채 20년', ecosStatCode: '817Y002', ecosItemCode1: '010220000' },
  { code: 'msb_1y', label: '통안증권 1년', ecosStatCode: '817Y002', ecosItemCode1: '010400001' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '817Y002', ecosItemCode1: '010502000' },
]

export function findInstrument(code: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.code === code)
}
```

모두 ECOS 통계표 `817Y002`(시장금리, 일별 `D`)의 서로 다른 `ecosItemCode1`.

## 7. `lib/ecos.ts` — ECOS API 클라이언트

- `fetchEcosRate(instrument, dateYYYYMMDD)`: 단일 날짜 1건 조회.
  URL: `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/1/${statCode}/D/${date}/${date}/${itemCode1}`
  응답 `StatisticSearch.row`가 없으면 `null` 반환(휴일 등 데이터 없음), 있으면 `{ date, value }`.
- `fetchEcosRateRange(instrument, start, end)`: 구간 전체 조회. ECOS가 요청당 최대 `ECOS_PAGE_SIZE`(3000)행만 반환하므로, 페이지가 가득 찰 때까지 `from`/`to` 인덱스를 3000씩 늘려가며 반복 호출해 전부 모은다.
- 두 함수 모두 `res.ok`가 아니면 에러를 던진다. `ECOS_API_KEY` 미설정 시 즉시 에러.

## 8. `lib/supabase.ts` — DB 클라이언트

`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`로 `createClient`, 모듈 스코프에 싱글턴 캐시(`persistSession: false`). 이 함수는 서버 코드(라우트 핸들러, cron)에서만 호출한다 — 클라이언트 번들에 서비스 롤 키가 들어가면 안 됨.

## 9. `lib/rates.ts` — 시계열 조회 / 기간 처리

- `Period = '1m' | '1y' | '5y' | 'all'`, `parsePeriod(input)`은 유효하지 않으면 `'5y'`로 폴백(쿼리 파라미터를 응답 헤더에 그대로 반영하는 걸 막기 위한 화이트리스트 검증).
- `periodStartDate(period)`: `'all'`이면 `null`, 아니면 오늘부터 1개월/1년/5년 전 날짜(ISO).
- `getRateSeries(instrumentCodes, period)`: `bond_yields`를 `instrument in (...)` + (있다면) `date >= start`로 조회, `date` 오름차순. PostgREST 1000행 제한을 우회하려고 `range()`로 1000행씩 페이지네이션해 전부 모은다.
- `getLastUpdatedAt()`: `bond_yields`에서 `date` 내림차순 1건 — 대시보드 하단 "마지막 업데이트" 표시용.
- `summarizeLatest(rows, instruments)`: `rows` 중 가장 최근 날짜 하나를 골라, 그 날짜의 지표별 값을 `instruments` 순서대로 `{ label, yield_pct }[]`로 반환 — 이메일 본문의 "최신값 표"에 사용.

## 10. `lib/excel.ts` — 워크북 생성

`buildRatesWorkbook(rows, instruments)`: `(date, instrument, yield_pct)[]`를 **날짜 1행 × 지표 1열**(pivot) 형태로 변환. 컬럼 순서는 `instruments` 순서 중 실제 `rows`에 존재하는 지표만, 날짜는 내림차순(최신이 위). `XLSX.utils.json_to_sheet` + `book_new/book_append_sheet`로 시트명 `금리데이터`, `XLSX.write(..., { type: 'buffer', bookType: 'xlsx' })`로 `Buffer` 반환.

## 11. `lib/gmail.ts` — 발송

`nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } })`를 모듈 스코프에 싱글턴 캐시. 세 함수:

- `sendRatesEmail(to, buffer, filename, latest)` — `/api/export/email`에서 1회성 발송. 제목에 `latest.date` 포함(있으면).
- `sendConfirmationEmail(to, code)` — 구독 신청 시 6자리 코드 발송.
- `sendDigestEmail(to, buffer, latest)` — 매영업일 자동 발송. 첨부파일명 고정 `bond-yields-5y.xlsx`, `NEXT_PUBLIC_SITE_URL`이 있으면 본문에 링크 추가.

공통: 실패 시 원본 에러를 감싸 한국어 메시지로 재던짐(`throw new Error(...)`).

## 12. `lib/subscribers.ts` — 구독자 관리

- `createPendingSubscriber(email)`: 이미 `pending`/`confirmed` 상태면 에러 반환. `confirm_token`(레거시, UUID, NOT NULL 제약 충족용)과 `short_code`(6자리 랜덤 숫자, `crypto.randomInt(100000, 1000000)`)를 만들어 `upsert(..., { onConflict: 'email' })`. 성공 시 `{ ok: true, code }`.
- `confirmSubscriberByCode(email, code)`: `email` + `short_code` + `status = 'pending'`로 매칭되는 행을 `status = 'confirmed'`로 업데이트. 매칭 행이 있었는지로 성공 여부 판단.
- `unsubscribeByEmail(email)`: 코드 없이 이메일만으로 `status = 'unsubscribed'`로 업데이트(악용해도 스팸이 줄어드는 방향이라 인증 불필요).
- `getConfirmedSubscribers()`: `status = 'confirmed'`인 `email` 목록.

## 13. `lib/rateLimit.ts` — IP 기준 발송 제한

`checkEmailRateLimit(ipAddress, maxPerHour = 5)`: 최근 1시간 내 해당 IP의 `email_send_log` 행 수를 세어 `{ allowed, remaining }` 반환. 조회 자체가 실패하면 fail-open(`allowed: true`)으로 UX를 막지 않는다. `recordEmailSend(ipAddress)`: 발송 시도(성공/실패 무관) 후 항상 1행 insert — 실패를 유도해 rate limit을 우회하는 것을 막기 위해 `finally`에서 호출.

## 14. `lib/holidays.ts` — 공휴일 조회

```ts
import { getSupabaseAdmin } from './supabase'

export async function isHoliday(isoDate: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('kr_holidays')
    .select('date')
    .eq('date', isoDate)
    .maybeSingle()

  if (error) {
    // 조회 실패로 발송을 막는 것보다, 공휴일이 아니라고 간주하고 정상 발송하는
    // 쪽이 더 안전하다 (fail open) — 발송 안 되는 것보다 하루 더 발송되는 게 낫다.
    console.error('공휴일 조회 실패:', error)
    return false
  }
  return data !== null
}
```

`send-digest`에서만 쓰인다(§16 참고). 배포 직후 `kr_holidays`가 비어 있으면 이 함수는 항상 `false`를 반환한다 — 관리자가 공휴일 데이터를 수동 입력해야 실제로 스킵이 동작한다.

## 15. API — `/api/rates` (대시보드 데이터)

`GET`. 쿼리: `instruments`(콤마 구분, 생략 시 전체 8개), `period`(`parsePeriod`로 검증). 유효한 코드가 0개면 `{ rows: [] }`. 아니면 `getRateSeries` 호출 후 `{ rows }`. 실패 시 `{ error }` + 500.

## 16. API — 크론 3종

### 16-1. `/api/cron/update-rates` (Vercel Cron, 매일 KST 16:10)

인증: `Authorization: Bearer <CRON_SECRET>` 불일치 시 401.

1. 쿼리 `?date=YYYYMMDD`(8자리 숫자 정규식 검증, 불일치 시 무시)가 있으면 그 날짜, 없으면 오늘(KST, `toLocaleString('en-US', { timeZone: 'Asia/Seoul' })`로 계산) 기준 `dateYYYYMMDD`/`isoDate` 확정.
2. `bond_yields`에서 그 `isoDate`로 이미 있는 지표(`confirmedCodes`)를 조회하고, `INSTRUMENTS` 중 아직 없는 것만 `instrumentsToFetch`로 추린다 — 이미 확인된 지표는 재조회하지 않음.
3. `instrumentsToFetch` 각각에 대해 `fetchEcosRate` 호출 → 데이터 있으면 `bond_yields`에 `upsert({ date, instrument, yield_pct }, { onConflict: 'date,instrument' })`하고 `updated`에, 없거나 실패하면 `skipped`에 코드 추가(한 지표의 예외가 나머지 처리를 막지 않도록 개별 try/catch).
4. 갱신 후 다시 그날 `bond_yields`를 조회해 `confirmedCodesAfterFetch` 산출, `INSTRUMENTS.every(i => confirmedCodesAfterFetch.has(i.code))`로 `allConfirmed` 판정.
5. `digestStatus` 결정 로직:
   - 기본값: 오늘치 행이 하나도 없으면 `skipped-no-data`, 하나라도 있지만 전부는 아니면 `skipped-incomplete`.
   - `allConfirmed`이면:
     - `NEXT_PUBLIC_SITE_URL`(없으면 `https://${VERCEL_URL}`)이 없으면 `skipped-no-url`.
     - 있으면 `digest_dispatch_log`에 `{ date: isoDate }`를 `upsert(..., { onConflict: 'date', ignoreDuplicates: true }).select()`로 원자적 선점 시도.
       - 에러면 `failed`.
       - 반환된 행이 0개(이미 선점됨)면 `skipped-already-sent`.
       - 선점 성공이면 `fetch(`${siteUrl}/api/cron/send-digest`, { headers: { Authorization: Bearer ${secret} } })` 호출 → `res.ok`면 `triggered`, 아니면 `failed`이고 방금 선점한 클레임을 삭제(다음 재시도가 다시 시도할 수 있게).
6. 응답: `{ date: isoDate, updated: string[], skipped: string[], digestStatus }`.

### 16-2. `/api/cron/send-digest` (외부 스케줄 없음 — `update-rates`가 내부적으로만 호출)

인증 동일(`CRON_SECRET`).

1. 오늘(KST) 날짜가 `isHoliday()`면 `{ skipped: 'holiday', sent: [], failed: [] }`.
2. `getConfirmedSubscribers()`가 0명이면 `{ skipped: 'no-subscribers', ... }`.
3. `INSTRUMENTS` 전체 코드로 `getRateSeries(..., '5y')` → `buildRatesWorkbook` → `summarizeLatest`.
4. 구독자별로 `sendDigestEmail` 시도, 성공/실패를 `sent`/`failed` 배열에 개별 기록(한 명 실패가 나머지를 막지 않음).
5. 응답: `{ date, sent, failed }`.

### 16-3. `/api/cron/backfill` (1회성 수동 백필, Vercel Cron에 등록되어 있지 않음)

인증 동일. 쿼리: `instruments=code1,code2`(생략 시 전체), `start=YYYYMMDD`(생략 시 5년 전, ECOS가 실제 시작일 이전 요청도 안전하게 처리). `end`는 항상 오늘(KST). 지표별로 `fetchEcosRateRange`로 구간 전체를 받아 `bond_yields`에 1000행씩(`UPSERT_CHUNK_SIZE`) 청크 upsert. 응답: `{ range, updated, skipped, totalRows }`.

## 17. API — 구독/해지

- `POST /api/subscribe`: 이메일 형식 검증(`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) → IP rate limit(시간당 5회, 위반 시 429) → `createPendingSubscriber` → `sendConfirmationEmail`. `recordEmailSend`는 요청 성패와 무관하게 항상 호출.
- `POST /api/subscribe/confirm-code`: 이메일 + 6자리 숫자 코드(`/^\d{6}$/`) 검증 → `confirmSubscriberByCode`.
- `POST /api/unsubscribe/email`: 이메일만 검증 → `unsubscribeByEmail`(코드 불필요).

## 18. API — 내보내기

- `GET /api/export/excel?instruments=...&period=...`: `buildRatesWorkbook`을 바로 파일로 스트리밍. 헤더 `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="bond-yields-${period}.xlsx"`. 지표가 0개면 400.
- `POST /api/export/email`: body `{ email, instruments, period }`. 이메일 검증 + 지표 검증 + IP rate limit(429) → `getRateSeries` → `buildRatesWorkbook` → `summarizeLatest` → `sendRatesEmail`. `recordEmailSend`는 발송 시도 후 항상 호출(`finally`).

## 19. 프론트엔드

### `app/page.tsx` (서버 컴포넌트)
`export const dynamic = 'force-dynamic'`(빌드 시 프리렌더 금지 — 항상 최신 DB 상태 반영, 빌드 타임에 Supabase 자격증명 불필요). `getRateSeries(전체 코드, '5y')`와 `getLastUpdatedAt()`을 병렬로 가져와 `<Dashboard>`에 props로 전달.

### `components/Dashboard.tsx` (클라이언트, 최상위 상태)
- state: `selected`(선택된 지표 코드 배열, 초기값 전체), `period`(초기 `'5y'`), `rows`, `loading`, `error`.
- `refetch(nextSelected, nextPeriod)`: `/api/rates?instruments=...&period=...` GET, 실패 시 `rows`는 유지하고 한국어 에러 메시지만 표시(원본 JS 에러 노출 안 함).
- 지표/기간 변경 핸들러가 각각 state 갱신 + `refetch` 호출.
- 레이아웃: 헤더(제목 + `ThemeToggle`) → 카드(지표 선택 + 기간 선택 + 차트) → `ExportPanel` → `SubscribePanel` → 마지막 업데이트/출처 안내.

### `components/InstrumentSelector.tsx`
`fieldset` + 지표별 `label`(pill 버튼처럼 스타일링된 체크박스, `sr-only` 실제 input). 선택 여부에 따라 `bg-accent text-white` / `bg-card text-muted`.

### `components/PeriodSelector.tsx`
`Period` 4종(`1m`/`1y`/`5y`/`all`) 버튼, `aria-pressed`로 선택 상태 표시.

### `components/TrendChart.tsx`
`recharts`의 `LineChart`. `rows`를 `date`별로 pivot(`{ date, [instrumentCode]: yield_pct }`)해서 오름차순 정렬. 지표별 `Line`, 색상 배열 `['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2']`을 인덱스 순환 사용. `rows`가 비면 "표시할 데이터가 없습니다." 텍스트.

### `components/ExportPanel.tsx`
두 카드: (1) 선택 지표 있으면 `/api/export/excel?...` 링크(a 태그, 직접 다운로드), 없으면 비활성 버튼. (2) 이메일 입력 + `POST /api/export/email` 발송, 상태별 메시지(성공은 accent색, 실패는 red).

### `components/SubscribePanel.tsx`
세 가지 폼을 한 카드에: 구독 신청(`/api/subscribe`), 구독 해지(`/api/unsubscribe/email`), 코드로 확인(`/api/subscribe/confirm-code`). 각각 독립된 loading/에러 상태.

### `components/ThemeToggle.tsx`
`next-themes`의 `useTheme`. 하이드레이션 불일치 방지를 위해 `mounted` 상태가 `true`가 되기 전엔 아무것도 렌더링하지 않음. 해/달 인라인 SVG 아이콘, `aria-label="다크모드 전환"`.

### `app/layout.tsx`
`Geist`/`Geist_Mono` 폰트, `metadata`(title/description), `ThemeProvider attribute="class" defaultTheme="system" enableSystem`, `<html suppressHydrationWarning>`(next-themes 필수 패턴).

### `app/error.tsx`
클라이언트 컴포넌트, Next.js 에러 바운더리. "문제가 발생했습니다" + 다시 시도 버튼(`reset()`).

### `app/globals.css`
Tailwind v4, `@custom-variant dark (&:where(.dark, .dark *))`(next-themes의 `.dark` 클래스 기반, `prefers-color-scheme` 미디어쿼리 아님). 라이트: `--background:#f2f4f6 --foreground:#191f28 --card:#ffffff --accent:#3182f6 --muted:#8b95a1`. 다크(`.dark`): `--background:#0a0a0a --foreground:#ededed --card:#17181a --accent:#4593fc --muted:#8b95a1`. `@theme inline`으로 `bg-card`/`text-muted`/`bg-accent` 등 유틸리티 클래스에 매핑.

## 20. 스케줄링 / 배포 설정

### `vercel.json`
```json
{
  "crons": [
    { "path": "/api/cron/update-rates", "schedule": "10 7 * * *" }
  ]
}
```
UTC 07:10 = KST 16:10. Vercel Hobby 플랜은 크론 하루 1회 제한이라 이게 유일한 자동 트리거.

### `.github/workflows/retry-update-rates.yml`
- `schedule`: KST 16:15~18:55 사이 5분 간격 3개 cron 표현식(UTC로 환산해 `on.schedule`에 등록)으로 `/api/cron/update-rates`(파라미터 없음 = 오늘치)를 재호출. `update-rates`가 이미 확인된 지표는 재조회하지 않으므로 늦게 갱신되는 지표(CD금리 등)만 다시 채워지고, 전부 확인되면 그때 다이제스트가 트리거된다.
- `workflow_dispatch` 입력(수동 실행/과거 백필용): `date`(YYYYMMDD, 비우면 오늘), `cron_secret`/`site_url`(비우면 저장된 GitHub Actions 시크릿 `CRON_SECRET`/`SITE_URL` 사용). 입력받은 시크릿은 `::add-mask::`로 로그에서 마스킹.
- 요청이 4xx/5xx면 `exit 1`로 워크플로 실패 처리.

## 21. 테스트 전략

`vitest.config.ts`: `environment: 'jsdom'`, `@vitejs/plugin-react`, `setupFiles: ['./vitest.setup.ts']`(주로 `@testing-library/jest-dom` matcher 등록), `passWithNoTests: true`, `@` 별칭이 리포 루트를 가리킴.

각 `lib/*.ts`, `app/api/**/route.ts`, `components/*.tsx`에 대응하는 `__tests__/*.test.ts(x)`가 있고, `getSupabaseAdmin`/`fetchEcosRate`/`nodemailer` 등 외부 I/O는 `vi.mock`으로 스텁 처리한다. 주요 케이스:
- `update-rates`: 인증 실패, 부분 조회 실패 격리, 이미 확인된 지표 재조회 안 함, `digestStatus` 5가지 분기, 날짜 override 검증.
- `holidays`: 공휴일 true/false, 조회 에러 시 fail-open.
- `rates`/`excel`/`gmail`/`subscribers`/`rateLimit`도 각각 정상/에러 경로를 커버.

새로 구현할 때는 이 테스트 스위트를 그대로(또는 동등하게) 재작성해 `npx vitest run`이 통과하는 것을 완료 기준으로 삼는다.

## 22. 처음부터 재구현하는 순서 (권장)

1. `create-next-app`(App Router, TS, Tailwind) → 위 디렉터리 구조로 정리.
2. Supabase 프로젝트 생성 → §5의 마이그레이션 4개를 SQL Editor에 순서대로 실행(단, 0002는 `kr_holidays`로).
3. `lib/instruments.ts`, `lib/supabase.ts`, `lib/ecos.ts` 구현 → 단일 지표 조회가 되는지 수동 테스트.
4. `lib/rates.ts`, `lib/excel.ts` 구현 → `/api/rates`, `/api/export/excel` 라우트.
5. `components/*`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css` 구현 → 대시보드 화면이 뜨는지 확인.
6. `lib/gmail.ts`, `lib/rateLimit.ts` 구현 → `/api/export/email` 라우트 + `ExportPanel`.
7. `lib/subscribers.ts` 구현 → `/api/subscribe`, `/api/subscribe/confirm-code`, `/api/unsubscribe/email` + `SubscribePanel`.
8. `lib/holidays.ts` 구현 → `/api/cron/update-rates`, `/api/cron/send-digest`(§16-1, 16-2 순서 그대로) → `/api/cron/backfill`.
9. `vercel.json`, `.github/workflows/retry-update-rates.yml`, 환경 변수(§4) 등록.
10. `docs/PRD.md`의 "배포 절차"를 따라 Vercel 배포 → 크론 동작 확인(수동으로 `?date=` override 호출해 백필 테스트) → GitHub Actions 시크릿 등록해 재시도 워크플로 확인.
11. `npx vitest run`으로 전체 테스트 통과 확인.

## 관련 문서

- [docs/PRD.md](PRD.md) — 다이제스트 발송 규칙 상세 + 운영 DB 현황(테이블명 불일치, 누락 이슈 이력)
- [docs/superpowers/specs/2026-07-27-국고채-금리-대시보드-design.md](superpowers/specs/2026-07-27-국고채-금리-대시보드-design.md) — 최초 대시보드 설계
- [docs/superpowers/specs/2026-07-28-recurring-email-digest-design.md](superpowers/specs/2026-07-28-recurring-email-digest-design.md) — 구독/다이제스트 원설계
