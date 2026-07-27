# 국고채·통안채·CD 금리 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a public Next.js dashboard that shows daily-updated Korean treasury bond (3/5/10/20yr), MSB (1yr), and CD (91d) rates with trend charts, an AI-generated Korean commentary, dark mode, and Excel download/email-delivery of the filtered data.

**Architecture:** Next.js (App Router, TypeScript) deployed on Vercel. Supabase Postgres stores daily rate rows (`bond_yields`) and daily AI commentary (`daily_summary`). A Vercel Cron job hits a protected API route once a day at 17:00 KST, which fetches the day's values from the Bank of Korea ECOS API, upserts them into Supabase, then asks OpenRouter for a Korean summary and stores it. The dashboard reads only from Supabase (never calls ECOS/OpenRouter directly from the page). Excel export and email delivery are separate API routes that query Supabase, build an `.xlsx` in memory, and either stream it back or send it via Resend.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS + `next-themes` (dark mode), Recharts (charts), `@supabase/supabase-js`, `xlsx` (SheetJS) for Excel generation, Resend (email), OpenRouter (AI summary, OpenAI-compatible HTTP API), Vitest + React Testing Library (tests), Vercel (hosting + Cron).

## Global Constraints

- All secrets (ECOS API key, OpenRouter API key, Resend API key, Supabase service role key, cron secret) live only in `.env.local` / Vercel environment variables — never hardcoded in source. (spec §8)
- All data shown on the dashboard is read from Supabase — never hardcoded in component code. (spec §8, CLAUDE.md rule 7)
- Daily collection job runs once per day at **17:00 KST** (= 08:00 UTC). (spec §3)
- Six instruments only: `treasury_3y`, `treasury_5y`, `treasury_10y`, `treasury_20y`, `msb_1y`, `cd_91d`. (spec §2)
- Dashboard is a public page, no login. Default period filter is "최근 5년". (spec §5)
- Dark mode follows system preference by default, manually toggleable, remembered in the browser (no login). (spec §5)
- Excel download and email both only ever contain the **currently selected instruments + period** — never the full dataset. (spec §5-1)
- Email sending is rate-limited per IP (default: 5 sends/hour) to prevent spam abuse. (spec §5-1)
- ECOS/OpenRouter failures must never crash the page — stale data + a visible "업데이트 실패" message instead. Weekends/holidays with no new ECOS data are NOT errors. (spec §6)

---

## File Structure

```
my project/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── .env.example
├── .gitignore
├── vercel.json
├── supabase/
│   └── migrations/0001_init.sql        # bond_yields, daily_summary, email_send_log tables
├── lib/
│   ├── supabase.ts                     # server-side Supabase client (service role)
│   ├── instruments.ts                  # instrument config (code, label, ECOS ids)
│   ├── ecos.ts                         # ECOS API client
│   ├── openrouter.ts                   # AI summary generation
│   ├── rates.ts                        # query bond_yields/daily_summary for the UI
│   ├── excel.ts                        # build .xlsx buffer from rate rows
│   ├── resend.ts                       # send email with Excel attachment
│   └── rateLimit.ts                    # Supabase-backed per-IP rate limiter
├── app/
│   ├── layout.tsx                      # root layout + ThemeProvider
│   ├── globals.css                     # Tailwind + dark mode base styles
│   ├── page.tsx                        # dashboard page (server component, initial fetch)
│   └── api/
│       ├── cron/update-rates/route.ts  # daily ECOS fetch + AI summary
│       └── export/
│           ├── excel/route.ts          # GET -> .xlsx download
│           └── email/route.ts          # POST -> send via Resend
├── components/
│   ├── ThemeToggle.tsx
│   ├── Dashboard.tsx                   # client component, owns filter state
│   ├── InstrumentSelector.tsx
│   ├── PeriodSelector.tsx
│   ├── TrendChart.tsx
│   ├── SummaryBox.tsx
│   └── ExportPanel.tsx                 # excel button + email form
└── lib/__tests__ , components/__tests__, app/api/**/__tests__  (Vitest specs colocated per area)
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (minimal placeholders)

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a runnable test command (`npm test`) that every later task builds on.

- [ ] **Step 1: Initialize the Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint
```

When prompted, accept defaults. This scaffolds `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @supabase/supabase-js recharts next-themes xlsx resend
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Add `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 한국은행 ECOS
ECOS_API_KEY=

# OpenRouter (AI 해설 생성)
OPENROUTER_API_KEY=

# Resend (이메일 발송)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Vercel Cron 보호용 비밀 값 (직접 임의 문자열 생성)
CRON_SECRET=
```

- [ ] **Step 6: Confirm `.env*` is gitignored**

Open `.gitignore` and confirm it already contains `.env*` (create-next-app adds this by default). If not, add:

```
.env*.local
.env
```

- [ ] **Step 7: Verify the app builds and tests run**

Run: `npm run build`
Expected: build succeeds with the default Next.js starter page.

Run: `npm test`
Expected: "No test files found" message (0 failures) — this is expected since no tests exist yet.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, Vitest, and env template"
```

---

### Task 2: Supabase schema and server client

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `lib/supabase.ts`
- Test: `lib/__tests__/supabase.test.ts`

**Interfaces:**
- Produces: `getSupabaseAdmin(): SupabaseClient` — a server-only client authenticated with the service role key, used by every API route in later tasks.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_init.sql`:

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
```

- [ ] **Step 2: Apply the migration to your Supabase project**

이 단계는 사람이 직접 해야 합니다 (Supabase 대시보드 접속 필요):

1. Supabase 프로젝트의 SQL Editor를 엽니다.
2. `supabase/migrations/0001_init.sql` 내용을 붙여넣고 실행합니다.
3. Table Editor에서 `bond_yields`, `daily_summary`, `email_send_log` 세 테이블이 생성되었는지 확인합니다.

- [ ] **Step 3: Write the failing test for the Supabase client**

Create `lib/__tests__/supabase.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('getSupabaseAdmin', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  it('throws a clear error when env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { getSupabaseAdmin } = await import('../supabase')
    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('returns a client when env vars are present', async () => {
    const { getSupabaseAdmin } = await import('../supabase')
    const client = getSupabaseAdmin()
    expect(client).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- supabase.test.ts`
Expected: FAIL — `lib/supabase.ts` does not exist yet.

- [ ] **Step 5: Implement `lib/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY')

  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return cached
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- supabase.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_init.sql lib/supabase.ts lib/__tests__/supabase.test.ts
git commit -m "feat: add Supabase schema migration and server client"
```

---

### Task 3: Instrument config and ECOS API client

**Files:**
- Create: `lib/instruments.ts`
- Create: `lib/ecos.ts`
- Test: `lib/__tests__/ecos.test.ts`

**Interfaces:**
- Produces:
  - `INSTRUMENTS: Instrument[]` where `Instrument = { code: string; label: string; ecosStatCode: string; ecosItemCode1: string }`
  - `fetchEcosRate(instrument: Instrument, date: string): Promise<{ date: string; value: number } | null>` — `date` format `YYYYMMDD`. Returns `null` if ECOS has no data for that date (e.g. weekend), throws on network/HTTP error.

> **확인 필요:** ECOS 통계표 코드(`ecosStatCode`)와 항목 코드(`ecosItemCode1`)는 아래에 넣은 값이 정확하다는 보장이 없습니다. 실제 값은 한국은행 ECOS Open API의 `StatisticItemList` 엔드포인트로 반드시 재확인한 뒤 진행하세요 (Step 1 참고). 이 표를 실제 값으로 정정하기 전까지는 이후 단계로 넘어가지 마세요.

- [ ] **Step 1: Verify the real ECOS stat/item codes before writing any code**

이 단계는 사람이 직접(또는 curl로) 확인해야 하는 조사 단계입니다:

1. 브라우저에서 다음 주소로 "시장금리(817Y002)" 통계표의 세부 항목 목록을 확인합니다 (본인의 인증키로 교체):
   `https://ecos.bok.or.kr/api/StatisticItemList/{인증키}/json/kr/1/100/817Y002`
2. 응답 JSON에서 아래 6개 지표에 해당하는 `ITEM_CODE`를 찾아 표로 정리합니다: 국고채(3년), 국고채(5년), 국고채(10년), 국고채(20년), 통안증권(1년), CD(91일).
3. 아래 `lib/instruments.ts`의 `ecosItemCode1` 값을 실제 확인한 코드로 반드시 교체합니다. 통계표 코드(`817Y002`) 자체가 다르다면 `ecosStatCode`도 함께 수정합니다.

- [ ] **Step 2: Write `lib/instruments.ts` (with verified codes from Step 1)**

```typescript
export type Instrument = {
  code: string
  label: string
  ecosStatCode: string
  ecosItemCode1: string
}

// 확인 필요: 아래 ecosItemCode1 값은 Step 1에서 실제 확인한 값으로 교체할 것
export const INSTRUMENTS: Instrument[] = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '817Y002', ecosItemCode1: '010200000' },
  { code: 'treasury_5y', label: '국고채 5년', ecosStatCode: '817Y002', ecosItemCode1: '010210000' },
  { code: 'treasury_10y', label: '국고채 10년', ecosStatCode: '817Y002', ecosItemCode1: '010220000' },
  { code: 'treasury_20y', label: '국고채 20년', ecosStatCode: '817Y002', ecosItemCode1: '010230000' },
  { code: 'msb_1y', label: '통안증권 1년', ecosStatCode: '817Y002', ecosItemCode1: '010150000' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '817Y002', ecosItemCode1: '010502000' },
]

export function findInstrument(code: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.code === code)
}
```

- [ ] **Step 3: Write the failing test for the ECOS client**

Create `lib/__tests__/ecos.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchEcosRate } from '../ecos'
import { INSTRUMENTS } from '../instruments'

describe('fetchEcosRate', () => {
  beforeEach(() => {
    process.env.ECOS_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the parsed date and value when ECOS has data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        StatisticSearch: {
          row: [{ TIME: '20260727', DATA_VALUE: '2.850' }],
        },
      }),
    }))

    const result = await fetchEcosRate(INSTRUMENTS[0], '20260727')
    expect(result).toEqual({ date: '20260727', value: 2.85 })
  })

  it('returns null when ECOS has no row for that date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다' },
      }),
    }))

    const result = await fetchEcosRate(INSTRUMENTS[0], '20260726')
    expect(result).toBeNull()
  })

  it('throws when the HTTP call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(fetchEcosRate(INSTRUMENTS[0], '20260727')).rejects.toThrow(/ECOS/)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- ecos.test.ts`
Expected: FAIL — `lib/ecos.ts` does not exist yet.

- [ ] **Step 5: Implement `lib/ecos.ts`**

```typescript
import type { Instrument } from './instruments'

export async function fetchEcosRate(
  instrument: Instrument,
  dateYYYYMMDD: string
): Promise<{ date: string; value: number } | null> {
  const apiKey = process.env.ECOS_API_KEY
  if (!apiKey) throw new Error('Missing env var: ECOS_API_KEY')

  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/1/${instrument.ecosStatCode}/D/${dateYYYYMMDD}/${dateYYYYMMDD}/${instrument.ecosItemCode1}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`ECOS API 호출 실패 (status ${res.status}) for ${instrument.code}`)
  }

  const json = await res.json()
  const rows = json?.StatisticSearch?.row
  if (!rows || rows.length === 0) {
    return null
  }

  const row = rows[0]
  return { date: row.TIME, value: Number(row.DATA_VALUE) }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- ecos.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/instruments.ts lib/ecos.ts lib/__tests__/ecos.test.ts
git commit -m "feat: add instrument config and ECOS API client"
```

---

### Task 4: Daily cron route — fetch and store rates

**Files:**
- Create: `app/api/cron/update-rates/route.ts`
- Test: `app/api/cron/__tests__/update-rates.test.ts`

**Interfaces:**
- Consumes: `INSTRUMENTS` from `lib/instruments.ts`, `fetchEcosRate` from `lib/ecos.ts`, `getSupabaseAdmin` from `lib/supabase.ts`.
- Produces: `GET` handler at `/api/cron/update-rates` that requires header `Authorization: Bearer ${CRON_SECRET}`, fetches all 6 instruments for "today" (KST), upserts non-null results into `bond_yields`, and returns a JSON summary `{ date, updated: string[], skipped: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/cron/__tests__/update-rates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock })

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

vi.mock('@/lib/ecos', () => ({
  fetchEcosRate: vi.fn(async (instrument) => {
    if (instrument.code === 'cd_91d') return null // 예: 해당 지표만 데이터 없음
    return { date: '20260727', value: 3.0 }
  }),
}))

describe('GET /api/cron/update-rates', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    upsertMock.mockClear()
    fromMock.mockClear()
  })

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('upserts rows for instruments with data and skips those without', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toContain('treasury_3y')
    expect(body.skipped).toContain('cd_91d')
    expect(fromMock).toHaveBeenCalledWith('bond_yields')
    expect(upsertMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- update-rates.test.ts`
Expected: FAIL — route file does not exist yet.

- [ ] **Step 3: Implement the route**

Create `app/api/cron/update-rates/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { fetchEcosRate } from '@/lib/ecos'
import { getSupabaseAdmin } from '@/lib/supabase'

function todayKstYYYYMMDD(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dateYYYYMMDD = todayKstYYYYMMDD()
  const supabase = getSupabaseAdmin()

  const updated: string[] = []
  const skipped: string[] = []

  for (const instrument of INSTRUMENTS) {
    const result = await fetchEcosRate(instrument, dateYYYYMMDD)
    if (!result) {
      skipped.push(instrument.code)
      continue
    }

    const isoDate = `${result.date.slice(0, 4)}-${result.date.slice(4, 6)}-${result.date.slice(6, 8)}`
    const { error } = await supabase
      .from('bond_yields')
      .upsert({ date: isoDate, instrument: instrument.code, yield_pct: result.value }, { onConflict: 'date,instrument' })

    if (error) {
      skipped.push(instrument.code)
      continue
    }
    updated.push(instrument.code)
  }

  return NextResponse.json({
    date: `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`,
    updated,
    skipped,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- update-rates.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Manual smoke test against the real ECOS API**

로컬에서 실제 API 키로 확인합니다:

```bash
npm run dev
```

다른 터미널에서:

```bash
curl -H "Authorization: Bearer <.env.local의 CRON_SECRET 값>" http://localhost:3000/api/cron/update-rates
```

Expected: JSON 응답의 `updated` 배열에 6개 지표 코드가 모두 들어있는지 확인 (평일 오후 5시 이후 기준). Supabase Table Editor에서 `bond_yields`에 오늘 날짜 6줄이 들어갔는지도 확인합니다.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/update-rates/route.ts app/api/cron/__tests__/update-rates.test.ts
git commit -m "feat: add daily cron route to fetch and store ECOS rates"
```

---

### Task 5: AI summary generation (OpenRouter)

**Files:**
- Create: `lib/openrouter.ts`
- Modify: `app/api/cron/update-rates/route.ts`
- Test: `lib/__tests__/openrouter.test.ts`

**Interfaces:**
- Produces: `generateDailySummary(rows: { instrument: string; label: string; yield_pct: number; prevYieldPct: number | null }[], dateIso: string): Promise<string>` — returns Korean commentary text, throws on API failure.
- Cron route now also calls this and upserts into `daily_summary`; failures here must not block rate storage from Step 4.

- [ ] **Step 1: Write the failing test for `generateDailySummary`**

Create `lib/__tests__/openrouter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateDailySummary } from '../openrouter'

describe('generateDailySummary', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the model text on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '오늘 10년물 금리는 소폭 상승했습니다.' } }] }),
    }))

    const text = await generateDailySummary(
      [{ instrument: 'treasury_10y', label: '국고채 10년', yield_pct: 3.05, prevYieldPct: 3.03 }],
      '2026-07-27'
    )
    expect(text).toBe('오늘 10년물 금리는 소폭 상승했습니다.')
  })

  it('throws when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(
      generateDailySummary([{ instrument: 'treasury_10y', label: '국고채 10년', yield_pct: 3.05, prevYieldPct: null }], '2026-07-27')
    ).rejects.toThrow(/OpenRouter/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- openrouter.test.ts`
Expected: FAIL — `lib/openrouter.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/openrouter.ts`**

```typescript
type SummaryRow = {
  instrument: string
  label: string
  yield_pct: number
  prevYieldPct: number | null
}

export async function generateDailySummary(rows: SummaryRow[], dateIso: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('Missing env var: OPENROUTER_API_KEY')

  const lines = rows
    .map((r) => {
      const diff = r.prevYieldPct == null ? '' : ` (전일 대비 ${(r.yield_pct - r.prevYieldPct).toFixed(3)}%p)`
      return `- ${r.label}: ${r.yield_pct}%${diff}`
    })
    .join('\n')

  const prompt = `아래는 ${dateIso} 기준 한국 채권/단기금리 현황이야. 비개발자도 이해할 수 있는 쉬운 한국어로 3~4문장 내로 오늘의 흐름을 요약해줘. 숫자를 과장하지 말고 사실만 담백하게 설명해줘.\n\n${lines}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenRouter API 호출 실패 (status ${res.status})`)
  }

  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter 응답에 내용이 없습니다')
  return text.trim()
}
```

> 참고: `model` 값(`anthropic/claude-3.5-haiku`)은 시작점입니다. 실제 사용 시 OpenRouter 모델 목록에서 원하는 비용/품질의 모델로 자유롭게 교체하세요.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- openrouter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire summary generation into the cron route**

Modify `app/api/cron/update-rates/route.ts` — add import and call after the existing upsert loop, before the final `return`:

```typescript
import { generateDailySummary } from '@/lib/openrouter'
```

Add before the final `return NextResponse.json(...)`:

```typescript
  const isoDate = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`
  let summaryStatus: 'ok' | 'failed' | 'skipped' = 'skipped'

  if (updated.length > 0) {
    try {
      const { data: todayRows } = await supabase
        .from('bond_yields')
        .select('instrument, yield_pct')
        .eq('date', isoDate)

      const { data: yesterdayRows } = await supabase
        .from('bond_yields')
        .select('instrument, yield_pct')
        .lt('date', isoDate)
        .order('date', { ascending: false })
        .limit(INSTRUMENTS.length)

      const prevByInstrument = new Map((yesterdayRows ?? []).map((r) => [r.instrument, r.yield_pct]))
      const summaryRows = (todayRows ?? []).map((r) => {
        const inst = INSTRUMENTS.find((i) => i.code === r.instrument)
        return {
          instrument: r.instrument,
          label: inst?.label ?? r.instrument,
          yield_pct: r.yield_pct,
          prevYieldPct: prevByInstrument.get(r.instrument) ?? null,
        }
      })

      const summaryText = await generateDailySummary(summaryRows, isoDate)
      await supabase.from('daily_summary').upsert({ date: isoDate, summary_text: summaryText })
      summaryStatus = 'ok'
    } catch (err) {
      console.error('AI 요약 생성 실패:', err)
      summaryStatus = 'failed'
    }
  }
```

Update the final return to include `summaryStatus`:

```typescript
  return NextResponse.json({
    date: isoDate,
    updated,
    skipped,
    summaryStatus,
  })
```

Remove the now-duplicate local `isoDate` computed inside the loop further up (keep only one declaration — the one added above, computed once after the loop).

- [ ] **Step 6: Update the cron route test to cover the summary call**

Add to `app/api/cron/__tests__/update-rates.test.ts`, extending the existing Supabase mock so `.select()` chains resolve, and mock `@/lib/openrouter`:

```typescript
vi.mock('@/lib/openrouter', () => ({
  generateDailySummary: vi.fn().mockResolvedValue('오늘의 요약입니다.'),
}))
```

Update `fromMock` to return an object supporting both `upsert` and `select().eq()/.lt().order().limit()` chains returning `{ data: [], error: null }`, then add:

```typescript
  it('includes summaryStatus in the response', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(['ok', 'failed', 'skipped']).toContain(body.summaryStatus)
  })
```

- [ ] **Step 7: Run all tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 8: Commit**

```bash
git add lib/openrouter.ts lib/__tests__/openrouter.test.ts app/api/cron/update-rates/route.ts app/api/cron/__tests__/update-rates.test.ts
git commit -m "feat: generate and store daily Korean AI summary via OpenRouter"
```

---

### Task 6: Vercel Cron schedule

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Produces: Vercel Cron configuration that calls `/api/cron/update-rates` daily at 17:00 KST.

- [ ] **Step 1: Create `vercel.json`**

17:00 KST = 08:00 UTC (KST is UTC+9, no daylight saving).

```json
{
  "crons": [
    {
      "path": "/api/cron/update-rates",
      "schedule": "0 8 * * *"
    }
  ]
}
```

- [ ] **Step 2: Note the auth header requirement for Vercel's own cron invocation**

Vercel Cron invokes the path via GET without custom headers by default. Vercel automatically adds an `Authorization: Bearer $CRON_SECRET` header to cron requests **only if** the `CRON_SECRET` environment variable is set in the Vercel project — confirm this is set in Task 16 (deployment). No code change needed here; this step is a reminder carried into the deployment task.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: schedule daily rate update via Vercel Cron at 17:00 KST"
```

---

### Task 7: Rates query library for the dashboard

**Files:**
- Create: `lib/rates.ts`
- Test: `lib/__tests__/rates.test.ts`

**Interfaces:**
- Produces:
  - `type Period = '1m' | '1y' | '5y' | 'all'`
  - `getRateSeries(instrumentCodes: string[], period: Period): Promise<{ date: string; instrument: string; yield_pct: number }[]>`
  - `getLatestSummary(): Promise<{ date: string; summary_text: string } | null>`
  - `getLastUpdatedAt(): Promise<string | null>` — most recent `date` present in `bond_yields`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/rates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryResult = { data: [{ date: '2026-07-27', instrument: 'treasury_10y', yield_pct: 3.05 }], error: null }

const chain: any = {
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { date: '2026-07-27', summary_text: '요약' }, error: null }),
  then: (resolve: any) => resolve(queryResult),
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: vi.fn().mockReturnValue(chain) }),
}))

describe('getRateSeries', () => {
  beforeEach(() => {
    chain.select.mockClear()
    chain.in.mockClear()
    chain.gte.mockClear()
  })

  it('queries only the requested instruments', async () => {
    const { getRateSeries } = await import('../rates')
    const rows = await getRateSeries(['treasury_10y'], '1y')
    expect(chain.in).toHaveBeenCalledWith('instrument', ['treasury_10y'])
    expect(rows).toEqual(queryResult.data)
  })

  it('applies no lower date bound for period "all"', async () => {
    const { getRateSeries } = await import('../rates')
    await getRateSeries(['treasury_10y'], 'all')
    expect(chain.gte).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rates.test.ts`
Expected: FAIL — `lib/rates.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/rates.ts`**

```typescript
import { getSupabaseAdmin } from './supabase'

export type Period = '1m' | '1y' | '5y' | 'all'

function periodStartDate(period: Period): string | null {
  if (period === 'all') return null
  const now = new Date()
  const start = new Date(now)
  if (period === '1m') start.setMonth(start.getMonth() - 1)
  if (period === '1y') start.setFullYear(start.getFullYear() - 1)
  if (period === '5y') start.setFullYear(start.getFullYear() - 5)
  return start.toISOString().slice(0, 10)
}

export async function getRateSeries(instrumentCodes: string[], period: Period) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('bond_yields')
    .select('date, instrument, yield_pct')
    .in('instrument', instrumentCodes)
    .order('date', { ascending: true })

  const start = periodStartDate(period)
  if (start) {
    query = query.gte('date', start)
  }

  const { data, error } = await query
  if (error) throw new Error(`금리 데이터 조회 실패: ${error.message}`)
  return data ?? []
}

export async function getLatestSummary() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('daily_summary')
    .select('date, summary_text')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
}

export async function getLastUpdatedAt(): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('bond_yields')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data?.date ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rates.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/rates.ts lib/__tests__/rates.test.ts
git commit -m "feat: add rate/summary query helpers for the dashboard"
```

---

### Task 8: Dashboard shell, layout, and dark mode

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`
- Create: `components/ThemeToggle.tsx`

**Interfaces:**
- Produces: root layout wraps children in `next-themes`'s `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`); `<ThemeToggle />` is a client component with a button that cycles light/dark and is usable by Task 9's `Dashboard`.

- [ ] **Step 1: Enable class-based dark mode in Tailwind**

Modify `tailwind.config.ts` — add `darkMode: 'class'` to the config object:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
export default config
```

- [ ] **Step 2: Wrap the app in a ThemeProvider**

Modify `app/layout.tsx`:

```tsx
import './globals.css'
import { ThemeProvider } from 'next-themes'

export const metadata = {
  title: '국고채·통안채·CD 금리 대시보드',
  description: '한국은행 ECOS 기반 일별 금리 추세 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Create the theme toggle button**

Create `components/ThemeToggle.tsx`:

```tsx
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
      aria-label="다크모드 전환"
    >
      {isDark ? '☀️ 라이트 모드' : '🌙 다크 모드'}
    </button>
  )
}
```

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, open `http://localhost:3000` in a browser.
Expected: page loads without errors; no visible toggle yet (added to the page in Task 11) — this step just confirms the layout/provider changes don't break the build. Check the browser console for hydration warnings (should be none, `suppressHydrationWarning` handles the theme-attribute mismatch).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css tailwind.config.ts components/ThemeToggle.tsx
git commit -m "feat: enable dark mode via next-themes and add theme toggle"
```

---

### Task 9: Instrument and period selector components

**Files:**
- Create: `components/InstrumentSelector.tsx`
- Create: `components/PeriodSelector.tsx`
- Test: `components/__tests__/InstrumentSelector.test.tsx`, `components/__tests__/PeriodSelector.test.tsx`

**Interfaces:**
- Consumes: `Instrument` type from `lib/instruments.ts`, `Period` type from `lib/rates.ts`.
- Produces:
  - `<InstrumentSelector instruments={Instrument[]} selected={string[]} onChange={(codes: string[]) => void} />`
  - `<PeriodSelector value={Period} onChange={(p: Period) => void} />`

- [ ] **Step 1: Write the failing test for InstrumentSelector**

Create `components/__tests__/InstrumentSelector.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InstrumentSelector } from '../InstrumentSelector'

const instruments = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '', ecosItemCode1: '' },
]

describe('InstrumentSelector', () => {
  it('renders a checkbox per instrument, checked according to `selected`', () => {
    render(<InstrumentSelector instruments={instruments} selected={['treasury_3y']} onChange={() => {}} />)
    expect(screen.getByLabelText('국고채 3년')).toBeChecked()
    expect(screen.getByLabelText('CD금리 91일')).not.toBeChecked()
  })

  it('calls onChange with the updated selection when toggled', () => {
    const onChange = vi.fn()
    render(<InstrumentSelector instruments={instruments} selected={['treasury_3y']} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('CD금리 91일'))
    expect(onChange).toHaveBeenCalledWith(['treasury_3y', 'cd_91d'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- InstrumentSelector.test.tsx`
Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement `components/InstrumentSelector.tsx`**

```tsx
'use client'

import type { Instrument } from '@/lib/instruments'

type Props = {
  instruments: Instrument[]
  selected: string[]
  onChange: (codes: string[]) => void
}

export function InstrumentSelector({ instruments, selected, onChange }: Props) {
  function toggle(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code))
    } else {
      onChange([...selected, code])
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="sr-only">지표 선택</legend>
      {instruments.map((inst) => (
        <label key={inst.code} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(inst.code)}
            onChange={() => toggle(inst.code)}
            aria-label={inst.label}
          />
          {inst.label}
        </label>
      ))}
    </fieldset>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- InstrumentSelector.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for PeriodSelector**

Create `components/__tests__/PeriodSelector.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PeriodSelector } from '../PeriodSelector'

describe('PeriodSelector', () => {
  it('highlights the active period button', () => {
    render(<PeriodSelector value="5y" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '5년' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1년' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked period', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value="5y" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '전체' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- PeriodSelector.test.tsx`
Expected: FAIL — component does not exist yet.

- [ ] **Step 7: Implement `components/PeriodSelector.tsx`**

```tsx
'use client'

import type { Period } from '@/lib/rates'

const OPTIONS: { value: Period; label: string }[] = [
  { value: '1m', label: '1개월' },
  { value: '1y', label: '1년' },
  { value: '5y', label: '5년' },
  { value: 'all', label: '전체' },
]

type Props = {
  value: Period
  onChange: (p: Period) => void
}

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? 'rounded bg-blue-600 px-3 py-1 text-sm text-white'
              : 'rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600'
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- PeriodSelector.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add components/InstrumentSelector.tsx components/PeriodSelector.tsx components/__tests__/InstrumentSelector.test.tsx components/__tests__/PeriodSelector.test.tsx
git commit -m "feat: add instrument and period selector components"
```

---

### Task 10: Trend chart component

**Files:**
- Create: `components/TrendChart.tsx`
- Test: `components/__tests__/TrendChart.test.tsx`

**Interfaces:**
- Consumes: rows shaped like `{ date: string; instrument: string; yield_pct: number }[]` (return type of `getRateSeries`) and `Instrument[]` for labels/colors.
- Produces: `<TrendChart rows={...} instruments={Instrument[]} />`, a Recharts `LineChart` with one line per instrument present in `rows`.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/TrendChart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TrendChart } from '../TrendChart'

const instruments = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '', ecosItemCode1: '' },
]

describe('TrendChart', () => {
  it('shows an empty-state message when there is no data', () => {
    render(<TrendChart rows={[]} instruments={instruments} />)
    expect(screen.getByText(/데이터가 없습니다/)).toBeInTheDocument()
  })

  it('renders a chart container when data is present', () => {
    const rows = [{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]
    render(<TrendChart rows={rows} instruments={instruments} />)
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TrendChart.test.tsx`
Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement `components/TrendChart.tsx`**

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Instrument } from '@/lib/instruments'

type Row = { date: string; instrument: string; yield_pct: number }

type Props = {
  rows: Row[]
  instruments: Instrument[]
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

export function TrendChart({ rows, instruments }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">표시할 데이터가 없습니다.</p>
  }

  const byDate = new Map<string, Record<string, number | string>>()
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { date: row.date }
    entry[row.instrument] = row.yield_pct
    byDate.set(row.date, entry)
  }
  const chartData = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const presentCodes = Array.from(new Set(rows.map((r) => r.instrument)))

  return (
    <div data-testid="trend-chart" className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis unit="%" tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {presentCodes.map((code, i) => {
            const label = instruments.find((inst) => inst.code === code)?.label ?? code
            return (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={label}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TrendChart.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/TrendChart.tsx components/__tests__/TrendChart.test.tsx
git commit -m "feat: add trend chart component"
```

---

### Task 11: Dashboard page — wire selectors, chart, summary, and dark mode toggle together

**Files:**
- Create: `components/SummaryBox.tsx`
- Create: `components/Dashboard.tsx`
- Create: `app/api/rates/route.ts` (client-side refetch endpoint for filter changes)
- Modify: `app/page.tsx`
- Test: `components/__tests__/SummaryBox.test.tsx`

**Interfaces:**
- Consumes: `InstrumentSelector`, `PeriodSelector`, `TrendChart`, `ThemeToggle`, `getRateSeries`/`getLatestSummary`/`getLastUpdatedAt` from `lib/rates.ts`.
- Produces: `app/page.tsx` is a server component that does the **initial** data fetch server-side (default: all instruments, `5y`) and renders `<Dashboard initialRows initialInstruments initialSummary initialLastUpdated />`; `Dashboard` is a client component owning filter state and refetching via `GET /api/rates?instruments=a,b&period=5y` on change.

- [ ] **Step 1: Write the failing test for SummaryBox**

Create `components/__tests__/SummaryBox.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SummaryBox } from '../SummaryBox'

describe('SummaryBox', () => {
  it('shows the summary text when present', () => {
    render(<SummaryBox summary={{ date: '2026-07-27', summary_text: '오늘의 해설입니다.' }} />)
    expect(screen.getByText('오늘의 해설입니다.')).toBeInTheDocument()
  })

  it('shows a fallback message when summary is null', () => {
    render(<SummaryBox summary={null} />)
    expect(screen.getByText(/준비하지 못했어요/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SummaryBox.test.tsx`
Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement `components/SummaryBox.tsx`**

```tsx
type Props = {
  summary: { date: string; summary_text: string } | null
}

export function SummaryBox({ summary }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-2 text-sm font-semibold">💬 오늘의 AI 해설</h2>
      {summary ? (
        <p className="text-sm">{summary.summary_text}</p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">오늘의 해설을 준비하지 못했어요.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SummaryBox.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the `/api/rates` route for client-side refetching**

Create `app/api/rates/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getRateSeries, type Period } from '@/lib/rates'
import { INSTRUMENTS } from '@/lib/instruments'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const instrumentsParam = searchParams.get('instruments')
  const period = (searchParams.get('period') as Period) ?? '5y'

  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = (instrumentsParam ? instrumentsParam.split(',') : INSTRUMENTS.map((i) => i.code)).filter((c) =>
    validCodes.has(c)
  )

  if (codes.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  try {
    const rows = await getRateSeries(codes, period)
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Implement `components/Dashboard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { InstrumentSelector } from './InstrumentSelector'
import { PeriodSelector } from './PeriodSelector'
import { TrendChart } from './TrendChart'
import { SummaryBox } from './SummaryBox'
import { ThemeToggle } from './ThemeToggle'
import { ExportPanel } from './ExportPanel'
import type { Instrument } from '@/lib/instruments'
import type { Period } from '@/lib/rates'

type Row = { date: string; instrument: string; yield_pct: number }

type Props = {
  instruments: Instrument[]
  initialRows: Row[]
  initialSummary: { date: string; summary_text: string } | null
  initialLastUpdated: string | null
}

export function Dashboard({ instruments, initialRows, initialSummary, initialLastUpdated }: Props) {
  const [selected, setSelected] = useState<string[]>(instruments.map((i) => i.code))
  const [period, setPeriod] = useState<Period>('5y')
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [loading, setLoading] = useState(false)

  async function refetch(nextSelected: string[], nextPeriod: Period) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ instruments: nextSelected.join(','), period: nextPeriod })
      const res = await fetch(`/api/rates?${params.toString()}`)
      const json = await res.json()
      setRows(json.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  function handleInstrumentsChange(codes: string[]) {
    setSelected(codes)
    refetch(codes, period)
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p)
    refetch(selected, p)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📈 국고채·통안채·CD 금리 대시보드</h1>
        <ThemeToggle />
      </div>

      <InstrumentSelector instruments={instruments} selected={selected} onChange={handleInstrumentsChange} />
      <PeriodSelector value={period} onChange={handlePeriodChange} />

      {loading ? <p className="text-sm text-gray-500">불러오는 중...</p> : <TrendChart rows={rows} instruments={instruments} />}

      <SummaryBox summary={initialSummary} />

      <ExportPanel selectedInstruments={selected} period={period} />

      <p className="text-xs text-gray-500 dark:text-gray-400">
        마지막 업데이트: {initialLastUpdated ?? '아직 없음'}
      </p>
    </div>
  )
}
```

- [ ] **Step 7: Wire the server component page**

Modify `app/page.tsx`:

```tsx
import { Dashboard } from '@/components/Dashboard'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries, getLatestSummary, getLastUpdatedAt } from '@/lib/rates'

export default async function Page() {
  const allCodes = INSTRUMENTS.map((i) => i.code)
  const [rows, summary, lastUpdated] = await Promise.all([
    getRateSeries(allCodes, '5y'),
    getLatestSummary(),
    getLastUpdatedAt(),
  ])

  return (
    <Dashboard
      instruments={INSTRUMENTS}
      initialRows={rows}
      initialSummary={summary}
      initialLastUpdated={lastUpdated}
    />
  )
}
```

> Note: `ExportPanel` is referenced here but built in Task 13 — leave a temporary stub (`export function ExportPanel() { return null }` in `components/ExportPanel.tsx`) so this task compiles standalone; Task 13 replaces it.

- [ ] **Step 8: Create the temporary ExportPanel stub**

Create `components/ExportPanel.tsx`:

```tsx
type Props = { selectedInstruments: string[]; period: string }
export function ExportPanel(_props: Props) {
  return null
}
```

- [ ] **Step 9: Run all tests and the build**

Run: `npm test`
Expected: PASS (all suites)

Run: `npm run build`
Expected: build succeeds (Supabase calls in `page.tsx` require valid `.env.local` values pointing at the real project from Task 2).

- [ ] **Step 10: Manual browser check**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: checkboxes for all 6 instruments, period buttons, a chart (if `bond_yields` has data from Task 4's manual test), the AI summary box, dark mode toggle works, "마지막 업데이트" shows a date.

- [ ] **Step 11: Commit**

```bash
git add components/SummaryBox.tsx components/Dashboard.tsx components/ExportPanel.tsx app/api/rates/route.ts app/page.tsx components/__tests__/SummaryBox.test.tsx
git commit -m "feat: wire dashboard page with selectors, chart, summary, and dark mode"
```

---

### Task 12: Excel generation library

**Files:**
- Create: `lib/excel.ts`
- Test: `lib/__tests__/excel.test.ts`

**Interfaces:**
- Produces: `buildRatesWorkbook(rows: { date: string; instrument: string; yield_pct: number }[], instruments: Instrument[]): Buffer` — an `.xlsx` file buffer with columns 날짜/지표/금리(%), one row per data point, sorted by date then instrument label.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/excel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildRatesWorkbook } from '../excel'
import { INSTRUMENTS } from '../instruments'

describe('buildRatesWorkbook', () => {
  it('produces a workbook with one row per data point and Korean headers', () => {
    const rows = [
      { date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 },
      { date: '2026-07-27', instrument: 'cd_91d', yield_pct: 3.5 },
    ]
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ 날짜: '2026-07-27', 금리: 2.85 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- excel.test.ts`
Expected: FAIL — `lib/excel.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/excel.ts`**

```typescript
import * as XLSX from 'xlsx'
import type { Instrument } from './instruments'

type Row = { date: string; instrument: string; yield_pct: number }

export function buildRatesWorkbook(rows: Row[], instruments: Instrument[]): Buffer {
  const labelByCode = new Map(instruments.map((i) => [i.code, i.label]))

  const sheetRows = rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.instrument.localeCompare(b.instrument))
    .map((r) => ({
      날짜: r.date,
      지표: labelByCode.get(r.instrument) ?? r.instrument,
      금리: r.yield_pct,
    }))

  const worksheet = XLSX.utils.json_to_sheet(sheetRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '금리데이터')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- excel.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add lib/excel.ts lib/__tests__/excel.test.ts
git commit -m "feat: add Excel workbook generation for rate data export"
```

---

### Task 13: Excel download route and button

**Files:**
- Create: `app/api/export/excel/route.ts`
- Modify: `components/ExportPanel.tsx`
- Test: `app/api/export/__tests__/excel.test.ts`

**Interfaces:**
- Produces: `GET /api/export/excel?instruments=a,b&period=5y` returning the `.xlsx` binary with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="..."`. `ExportPanel` now renders a real "엑셀 다운로드" link/button (browser-native download, no JS fetch needed since it's a GET with query params).

- [ ] **Step 1: Write the failing test**

Create `app/api/export/__tests__/excel.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/rates', () => ({
  getRateSeries: vi.fn().mockResolvedValue([{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]),
}))

describe('GET /api/export/excel', () => {
  it('returns an xlsx file with the correct headers', async () => {
    const { GET } = await import('../excel/route')
    const req = new Request('http://localhost/api/export/excel?instruments=treasury_3y&period=1y')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    expect(res.headers.get('content-disposition')).toContain('attachment')
  })

  it('returns 400 when no valid instruments are given', async () => {
    const { GET } = await import('../excel/route')
    const req = new Request('http://localhost/api/export/excel?instruments=&period=1y')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- excel.test.ts` (the one under `app/api/export/__tests__`)
Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Implement `app/api/export/excel/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getRateSeries, type Period } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { INSTRUMENTS } from '@/lib/instruments'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = (searchParams.get('instruments') ?? '')
    .split(',')
    .filter((c) => validCodes.has(c))
  const period = (searchParams.get('period') as Period) ?? '5y'

  if (codes.length === 0) {
    return NextResponse.json({ error: '선택된 지표가 없습니다.' }, { status: 400 })
  }

  const rows = await getRateSeries(codes, period)
  const buffer = buildRatesWorkbook(rows, INSTRUMENTS)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bond-yields-${period}.xlsx"`,
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- excel.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Replace the ExportPanel stub with the real download button (email form comes in Task 15)**

Modify `components/ExportPanel.tsx`:

```tsx
'use client'

type Props = {
  selectedInstruments: string[]
  period: string
}

export function ExportPanel({ selectedInstruments, period }: Props) {
  const params = new URLSearchParams({ instruments: selectedInstruments.join(','), period })

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
      <a
        href={`/api/export/excel?${params.toString()}`}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white"
      >
        📥 엑셀 다운로드
      </a>
    </div>
  )
}
```

- [ ] **Step 6: Manual browser check**

Run: `npm run dev`, open the dashboard, select a couple of instruments, click "엑셀 다운로드".
Expected: an `.xlsx` file downloads; opening it in Excel/Numbers/Google Sheets shows 날짜/지표/금리 columns matching the selected filters.

- [ ] **Step 7: Commit**

```bash
git add app/api/export/excel/route.ts components/ExportPanel.tsx app/api/export/__tests__/excel.test.ts
git commit -m "feat: add Excel download endpoint and button"
```

---

### Task 14: Supabase-backed email rate limiter

**Files:**
- Create: `lib/rateLimit.ts`
- Test: `lib/__tests__/rateLimit.test.ts`

**Interfaces:**
- Produces: `checkEmailRateLimit(ipAddress: string, maxPerHour?: number): Promise<{ allowed: boolean; remaining: number }>` and `recordEmailSend(ipAddress: string): Promise<void>`, backed by the `email_send_log` table from Task 2's migration.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/rateLimit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn().mockReturnValue({
  select: () => ({
    eq: () => ({
      gte: selectMock,
    }),
  }),
  insert: insertMock,
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('checkEmailRateLimit', () => {
  beforeEach(() => {
    insertMock.mockClear()
  })

  it('allows the send when under the limit', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], error: null })
    const { checkEmailRateLimit } = await import('../rateLimit')
    const result = await checkEmailRateLimit('1.2.3.4', 5)
    expect(result).toEqual({ allowed: true, remaining: 3 })
  })

  it('blocks the send when at or over the limit', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }], error: null })
    const { checkEmailRateLimit } = await import('../rateLimit')
    const result = await checkEmailRateLimit('1.2.3.4', 5)
    expect(result).toEqual({ allowed: false, remaining: 0 })
  })
})

describe('recordEmailSend', () => {
  it('inserts a log row for the given IP', async () => {
    const { recordEmailSend } = await import('../rateLimit')
    await recordEmailSend('1.2.3.4')
    expect(insertMock).toHaveBeenCalledWith({ ip_address: '1.2.3.4' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rateLimit.test.ts`
Expected: FAIL — `lib/rateLimit.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/rateLimit.ts`**

```typescript
import { getSupabaseAdmin } from './supabase'

export async function checkEmailRateLimit(ipAddress: string, maxPerHour = 5) {
  const supabase = getSupabaseAdmin()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('ip_address', ipAddress)
    .gte('created_at', oneHourAgo)

  if (error) {
    // Fail closed is too strict for a UX feature failure — fail open but log it.
    console.error('rate limit 조회 실패:', error)
    return { allowed: true, remaining: maxPerHour }
  }

  const count = data?.length ?? 0
  return { allowed: count < maxPerHour, remaining: Math.max(0, maxPerHour - count) }
}

export async function recordEmailSend(ipAddress: string) {
  const supabase = getSupabaseAdmin()
  await supabase.from('email_send_log').insert({ ip_address: ipAddress })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rateLimit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/rateLimit.ts lib/__tests__/rateLimit.test.ts
git commit -m "feat: add Supabase-backed per-IP email rate limiter"
```

---

### Task 15: Email delivery route (Resend)

**Files:**
- Create: `lib/resend.ts`
- Create: `app/api/export/email/route.ts`
- Test: `lib/__tests__/resend.test.ts`, `app/api/export/__tests__/email.test.ts`

**Interfaces:**
- Produces:
  - `sendRatesEmail(to: string, buffer: Buffer, filename: string): Promise<void>` in `lib/resend.ts`, throws on failure.
  - `POST /api/export/email` with JSON body `{ email: string; instruments: string[]; period: Period }`. Validates the email format, checks the rate limiter (keyed by the `x-forwarded-for` header), builds the workbook, sends it, records the send, and returns `{ ok: true }` or `{ ok: false, error: string }` with an appropriate status (400 invalid email, 429 rate-limited, 500 send failure).

- [ ] **Step 1: Write the failing test for `sendRatesEmail`**

Create `lib/__tests__/resend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}))

describe('sendRatesEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'dashboard@example.com'
    sendMock.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends an email with the buffer as a base64 attachment', async () => {
    const { sendRatesEmail } = await import('../resend')
    await sendRatesEmail('user@example.com', Buffer.from('fake-xlsx'), 'rates.xlsx')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'dashboard@example.com',
        attachments: [expect.objectContaining({ filename: 'rates.xlsx' })],
      })
    )
  })

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'bad request' } })
    const { sendRatesEmail } = await import('../resend')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'rates.xlsx')).rejects.toThrow(/bad request/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resend.test.ts`
Expected: FAIL — `lib/resend.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/resend.ts`**

```typescript
import { Resend } from 'resend'

export async function sendRatesEmail(to: string, buffer: Buffer, filename: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '국고채·통안채·CD 금리 데이터',
    html: '<p>요청하신 금리 데이터를 첨부파일로 보내드립니다.</p>',
    attachments: [{ filename, content: buffer.toString('base64') }],
  })

  if (error) {
    throw new Error(`이메일 발송 실패: ${error.message}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- resend.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the email API route**

Create `app/api/export/__tests__/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rates', () => ({
  getRateSeries: vi.fn().mockResolvedValue([{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]),
}))
vi.mock('@/lib/resend', () => ({ sendRatesEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({
  checkEmailRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  recordEmailSend: vi.fn().mockResolvedValue(undefined),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/export/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/export/email', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid email address', async () => {
    const { POST } = await import('../email/route')
    const res = await POST(makeRequest({ email: 'not-an-email', instruments: ['treasury_3y'], period: '1y' }))
    expect(res.status).toBe(400)
  })

  it('rejects when no instruments are selected', async () => {
    const { POST } = await import('../email/route')
    const res = await POST(makeRequest({ email: 'user@example.com', instruments: [], period: '1y' }))
    expect(res.status).toBe(400)
  })

  it('sends the email and returns ok:true on success', async () => {
    const { POST } = await import('../email/route')
    const res = await POST(makeRequest({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns 429 when rate-limited', async () => {
    const { checkEmailRateLimit } = await import('@/lib/rateLimit')
    vi.mocked(checkEmailRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 })
    const { POST } = await import('../email/route')
    const res = await POST(makeRequest({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y' }))
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- email.test.ts`
Expected: FAIL — route does not exist yet.

- [ ] **Step 7: Implement `app/api/export/email/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getRateSeries, type Period } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { sendRatesEmail } from '@/lib/resend'
import { checkEmailRateLimit, recordEmailSend } from '@/lib/rateLimit'
import { INSTRUMENTS } from '@/lib/instruments'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email
  const instruments: string[] = body?.instruments ?? []
  const period: Period = body?.period ?? '5y'

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }

  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = instruments.filter((c) => validCodes.has(c))
  if (codes.length === 0) {
    return NextResponse.json({ ok: false, error: '선택된 지표가 없습니다.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkEmailRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '잠시 후 다시 시도해주세요. (시간당 발송 횟수를 초과했습니다)' },
      { status: 429 }
    )
  }

  try {
    const rows = await getRateSeries(codes, period)
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    await sendRatesEmail(email, buffer, `bond-yields-${period}.xlsx`)
    await recordEmailSend(ip)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('이메일 발송 실패:', err)
    return NextResponse.json({ ok: false, error: '발송에 실패했어요, 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- email.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add lib/resend.ts app/api/export/email/route.ts lib/__tests__/resend.test.ts app/api/export/__tests__/email.test.ts
git commit -m "feat: add rate-limited email delivery endpoint via Resend"
```

---

### Task 16: Email form UI

**Files:**
- Modify: `components/ExportPanel.tsx`
- Test: `components/__tests__/ExportPanel.test.tsx`

**Interfaces:**
- Produces: `ExportPanel` now also renders an email `<input>` + "이메일로 받기" button that `POST`s to `/api/export/email` and shows a success/error/loading message.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ExportPanel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportPanel } from '../ExportPanel'

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    )
  })

  it('shows a success message after sending', async () => {
    render(<ExportPanel selectedInstruments={['treasury_3y']} period="1y" />)

    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '이메일로 받기' }))

    await waitFor(() => expect(screen.getByText(/발송 완료/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/export/email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y' }),
      })
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: '잠시 후 다시 시도해주세요.' }),
    } as Response)

    render(<ExportPanel selectedInstruments={['treasury_3y']} period="1y" />)
    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '이메일로 받기' }))

    await waitFor(() => expect(screen.getByText('잠시 후 다시 시도해주세요.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ExportPanel.test.tsx`
Expected: FAIL — current `ExportPanel` has no email form.

- [ ] **Step 3: Implement the full `components/ExportPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'

type Props = {
  selectedInstruments: string[]
  period: string
}

type Status = 'idle' | 'sending' | 'success' | 'error'

export function ExportPanel({ selectedInstruments, period }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const excelParams = new URLSearchParams({ instruments: selectedInstruments.join(','), period })

  async function handleSend() {
    setStatus('sending')
    setMessage('')
    try {
      const res = await fetch('/api/export/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, instruments: selectedInstruments, period }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus('success')
        setMessage('발송 완료!')
      } else {
        setStatus('error')
        setMessage(json.error ?? '발송에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setStatus('error')
      setMessage('발송에 실패했어요, 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
      <a
        href={`/api/export/excel?${excelParams.toString()}`}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white"
      >
        📥 엑셀 다운로드
      </a>

      <label htmlFor="export-email" className="sr-only">
        이메일 주소
      </label>
      <input
        id="export-email"
        type="email"
        placeholder="이메일 주소 입력"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="이메일 주소"
        className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={status === 'sending' || !email}
        className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        이메일로 받기
      </button>

      {message && (
        <span className={status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-600'}>{message}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ExportPanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites across the whole project)

- [ ] **Step 6: Manual browser check**

Run: `npm run dev`, enter a real email address you control, click "이메일로 받기".
Expected: success message appears, and the Excel attachment arrives in the inbox within a minute (requires real `RESEND_API_KEY`/`RESEND_FROM_EMAIL` in `.env.local` and a verified sender in Resend).

- [ ] **Step 7: Commit**

```bash
git add components/ExportPanel.tsx components/__tests__/ExportPanel.test.tsx
git commit -m "feat: add email delivery form to export panel"
```

---

### Task 17: Deployment to Vercel and end-to-end verification

**Files:**
- Create: `README.md` (deployment + env var checklist)
- No source changes — this task is operational.

**Interfaces:**
- N/A (deployment task)

- [ ] **Step 1: Write `README.md` with the non-developer deployment checklist**

```markdown
# 국고채·통안채·CD 금리 대시보드

## 배포 전 준비물 (환경 변수)

Vercel 프로젝트의 Settings → Environment Variables에 아래 값을 모두 등록해야 합니다.

| 변수명 | 설명 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role key (절대 외부 노출 금지) |
| ECOS_API_KEY | 한국은행 ECOS API 인증키 |
| OPENROUTER_API_KEY | OpenRouter API 키 |
| RESEND_API_KEY | Resend API 키 |
| RESEND_FROM_EMAIL | Resend에 등록/인증한 발신 이메일 주소 |
| CRON_SECRET | 임의의 긴 랜덤 문자열 (Cron 요청 인증용) |

## 배포 절차

1. Supabase 프로젝트에서 `supabase/migrations/0001_init.sql`을 SQL Editor로 실행
2. GitHub 저장소에 이 코드를 push
3. Vercel에서 해당 저장소를 Import
4. 위 표의 환경 변수를 모두 등록
5. Deploy
6. 배포 완료 후 실제 URL로 접속해 아래 "배포 후 테스트" 항목을 확인
```

- [ ] **Step 2: Push the code to a Git remote**

이 단계는 사용자가 GitHub 저장소를 만든 뒤 진행합니다:

```bash
git remote add origin <사용자의 GitHub 저장소 URL>
git push -u origin master
```

- [ ] **Step 3: Deploy to Vercel**

Vercel 커넥터를 사용해 배포를 진행합니다 (Vercel 대시보드에서 저장소 Import → 위 환경 변수 등록 → Deploy). 배포가 끝나면 실제 URL을 확인합니다.

- [ ] **Step 4: Post-deploy smoke test — page loads**

실제 배포 URL로 접속합니다.
Expected: 대시보드가 에러 없이 로드되고, 지표/기간 선택, 그래프, AI 해설, 다크모드 토글이 모두 보입니다.

- [ ] **Step 5: Post-deploy smoke test — manually trigger the cron endpoint once**

```bash
curl -H "Authorization: Bearer <Vercel에 등록한 CRON_SECRET 값>" https://<배포 주소>/api/cron/update-rates
```

Expected: JSON 응답에 `updated` 배열이 채워지고, Supabase `bond_yields`/`daily_summary`에 오늘 날짜 데이터가 생성됩니다.

- [ ] **Step 6: Post-deploy smoke test — Excel and email**

배포된 페이지에서 엑셀 다운로드 버튼과 이메일 발송 기능을 각각 한 번씩 실제로 테스트합니다.
Expected: 다운로드된 파일이 선택한 지표/기간과 일치하고, 입력한 이메일로 동일한 파일이 도착합니다.

- [ ] **Step 7: Confirm Vercel Cron is registered**

Vercel 프로젝트의 Settings → Cron Jobs에서 `/api/cron/update-rates`가 매일 08:00 UTC(한국시간 17:00)로 등록되어 있는지 확인합니다.

- [ ] **Step 8: Next-day verification**

익일 한국시간 17시 이후, Supabase `bond_yields`에 새 날짜의 6개 행이 자동으로 추가되었는지, 대시보드에 최신 날짜가 반영되는지 확인합니다.

- [ ] **Step 9: Commit the README**

```bash
git add README.md
git commit -m "docs: add deployment checklist and environment variable guide"
```

---

## Self-Review Notes

- **Spec coverage:** All 9 spec sections map to tasks — §2/§4 → Tasks 2–7, §5 (UI incl. dark mode) → Tasks 8–11, §5-1 (Excel/email) → Tasks 12–16, §6 (error handling) → built into Tasks 4/5/15 (null-safe skip, try/catch around AI summary, rate-limit 429), §7 (test plan) → a test step embedded in every task plus Task 17's post-deploy checks, §8 (security) → env vars only, enforced throughout, §9 (out of scope) → no auth/subscription features added.
- **Placeholder scan:** No TBD/TODO remain except the explicitly-flagged, honestly-labeled "확인 필요" on ECOS stat/item codes in Task 3 — this is a real external unknown (not a design gap) with a concrete verification step, not a stand-in for undone design work.
- **Type consistency:** `Period` type defined once in `lib/rates.ts` and imported everywhere else (Tasks 9, 11, 13, 15). `Instrument` type defined once in `lib/instruments.ts` and imported everywhere else. Row shape `{ date, instrument, yield_pct }` used consistently across `lib/rates.ts`, `lib/excel.ts`, `TrendChart`, and both export routes.
