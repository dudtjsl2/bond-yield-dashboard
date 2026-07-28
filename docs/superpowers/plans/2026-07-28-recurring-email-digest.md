# 매영업일 자동 이메일 발송 구독 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 누구나 이메일을 입력해 구독하면, 매영업일(주말·한국 공휴일 제외) 오후 5시(KST)에 전 지표 × 5년 데이터를 담은 엑셀 파일을 자동으로 이메일로 받을 수 있게 한다.

**Architecture:** 기존 Vercel Cron(`CRON_SECRET` 인증)과 Resend/Supabase 연동 패턴을 재사용한다. 신규 Supabase 테이블 `email_subscribers`(구독자 상태 관리)와 `holidays`(공휴일 목록)를 추가하고, 더블 옵트인(확인 이메일 → 링크 클릭) 구독 흐름과 매영업일 발송 크론 라우트를 신규로 만든다.

**Tech Stack:** Next.js App Router (route handlers), Supabase(service-role client), Resend, xlsx(`buildRatesWorkbook` 재사용), Vitest + Testing Library.

## Global Constraints

- 시크릿 키는 코드에 직접 쓰지 않고 `.env`/환경 변수로만 참조한다 (CLAUDE.md 보안 규칙 1번).
- 예시/테스트 데이터는 가짜(mock) 데이터만 사용한다 (CLAUDE.md 보안 규칙 2번).
- 코드에 사용자 대상 문자열은 한국어로 작성한다 (기존 코드 전반의 관례).
- 발송 내용은 전 지표 × 5년 고정, 구독자별 개인화는 하지 않는다 (설계 문서 결정).
- 구독은 더블 옵트인(확인 이메일 링크 클릭 필요)이며, 사이트 내 별도 해지 UI는 만들지 않고 이메일 링크로만 처리한다 (설계 문서 결정).
- 공휴일 정보는 Supabase `holidays` 테이블에서 관리자가 직접 관리하며, 외부 API 연동은 하지 않는다 (설계 문서 결정).
- 기존 `ExportPanel`의 1회성 발송 버튼은 변경하지 않는다.

---

### Task 1: Supabase 마이그레이션 — `email_subscribers`, `holidays` 테이블

**Files:**
- Create: `supabase/migrations/0002_email_subscribers.sql`

**Interfaces:**
- Produces: `email_subscribers(id uuid, email text unique, status text, confirm_token text, created_at timestamptz)`, `holidays(date date primary key, name text)` — 이후 모든 태스크가 이 스키마를 가정하고 쿼리를 작성한다.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0001_init.sql`의 스타일(RLS 활성화, `if not exists`)을 그대로 따른다.

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

create table if not exists holidays (
  date date primary key,
  name text not null
);

-- 다른 테이블과 동일하게, 서비스 롤 클라이언트로만 접근하고
-- anon/authenticated 롤에는 접근 권한을 주지 않는다.
alter table email_subscribers enable row level security;
alter table holidays enable row level security;
```

- [ ] **Step 2: Supabase에 마이그레이션 적용 안내**

이 프로젝트에는 Supabase CLI 자동 배포 파이프라인이 없으므로, 사용자가 Supabase 대시보드의 SQL Editor에서 이 파일 내용을 직접 실행하거나 `supabase db push`(CLI 연결이 되어 있는 경우)로 적용해야 한다는 점을 커밋 메시지나 PR 설명에 남긴다. 이 단계는 코드 변경이 아니므로 별도 커밋 없이 다음 스텝에서 함께 커밋한다.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_email_subscribers.sql
git commit -m "feat: add email_subscribers and holidays tables"
```

---

### Task 2: `lib/holidays.ts` — 공휴일 판별

**Files:**
- Create: `lib/holidays.ts`
- Test: `lib/__tests__/holidays.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` from `lib/supabase.ts`
- Produces: `isHoliday(isoDate: string): Promise<boolean>` — Task 9(크론)에서 사용

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/__tests__/holidays.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingleMock = vi.fn()
const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
const fromMock = vi.fn().mockReturnValue({ select: selectMock })

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('isHoliday', () => {
  beforeEach(() => {
    fromMock.mockClear()
  })

  it('returns true when the date exists in the holidays table', async () => {
    maybeSingleMock.mockResolvedValue({ data: { date: '2026-09-28' }, error: null })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-09-28')).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('holidays')
  })

  it('returns false when the date is not a holiday', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-07-28')).toBe(false)
  })

  it('fails open (returns false) when the query errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: new Error('down') })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-07-28')).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/holidays.test.ts`
Expected: FAIL — `Cannot find module '../holidays'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/holidays.ts
import { getSupabaseAdmin } from './supabase'

export async function isHoliday(isoDate: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('holidays')
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/holidays.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/holidays.ts lib/__tests__/holidays.test.ts
git commit -m "feat: add isHoliday holiday-table lookup"
```

---

### Task 3: `lib/subscribers.ts` — 구독자 CRUD

**Files:**
- Create: `lib/subscribers.ts`
- Test: `lib/__tests__/subscribers.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` from `lib/supabase.ts`
- Produces:
  - `createPendingSubscriber(email: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>` — Task 6에서 사용
  - `confirmSubscriber(token: string): Promise<boolean>` — Task 7에서 사용
  - `unsubscribeByToken(token: string): Promise<boolean>` — Task 8에서 사용
  - `getConfirmedSubscribers(): Promise<{ email: string; confirm_token: string }[]>` — Task 9에서 사용

- [ ] **Step 1: `createPendingSubscriber`의 실패하는 테스트 작성**

```ts
// lib/__tests__/subscribers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('createPendingSubscriber', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('creates a pending subscriber with a fresh token when the email is new', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      upsert: upsertMock,
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('new@example.com')

    expect(result.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', status: 'pending' }),
      { onConflict: 'email' }
    )
  })

  it('rejects when the email is already pending or confirmed', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { status: 'confirmed' }, error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('existing@example.com')

    expect(result).toEqual({ ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' })
  })

  it('allows re-subscribing an email that previously unsubscribed', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { status: 'unsubscribed' }, error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      upsert: upsertMock,
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('back@example.com')

    expect(result.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: FAIL — `Cannot find module '../subscribers'`

- [ ] **Step 3: `createPendingSubscriber` 최소 구현**

```ts
// lib/subscribers.ts
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from './supabase'

type SubscribeResult = { ok: true; token: string } | { ok: false; error: string }

export async function createPendingSubscriber(email: string): Promise<SubscribeResult> {
  const supabase = getSupabaseAdmin()

  const { data: existing, error: selectError } = await supabase
    .from('email_subscribers')
    .select('status')
    .eq('email', email)
    .maybeSingle()

  if (selectError) {
    console.error('구독자 조회 실패:', selectError)
    return { ok: false, error: '잠시 후 다시 시도해주세요.' }
  }

  if (existing && (existing.status === 'pending' || existing.status === 'confirmed')) {
    return { ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' }
  }

  const token = randomUUID()
  const { error: upsertError } = await supabase
    .from('email_subscribers')
    .upsert({ email, status: 'pending', confirm_token: token }, { onConflict: 'email' })

  if (upsertError) {
    console.error('구독 등록 실패:', upsertError)
    return { ok: false, error: '잠시 후 다시 시도해주세요.' }
  }

  return { ok: true, token }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: `confirmSubscriber`와 `unsubscribeByToken`의 실패하는 테스트 추가**

같은 파일 `lib/__tests__/subscribers.test.ts`에 아래 두 `describe` 블록을 추가한다.

```ts
describe('confirmSubscriber', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('confirms the subscriber matching the token and returns true', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ email: 'a@example.com' }], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { confirmSubscriber } = await import('../subscribers')
    expect(await confirmSubscriber('valid-token')).toBe(true)
  })

  it('returns false when no row matches the token', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { confirmSubscriber } = await import('../subscribers')
    expect(await confirmSubscriber('bad-token')).toBe(false)
  })
})

describe('unsubscribeByToken', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('unsubscribes the matching row and returns true', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ email: 'a@example.com' }], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { unsubscribeByToken } = await import('../subscribers')
    expect(await unsubscribeByToken('valid-token')).toBe(true)
  })

  it('returns false when no row matches the token', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { unsubscribeByToken } = await import('../subscribers')
    expect(await unsubscribeByToken('bad-token')).toBe(false)
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: FAIL — `confirmSubscriber`/`unsubscribeByToken` are not exported

- [ ] **Step 7: `confirmSubscriber`와 `unsubscribeByToken` 구현 추가**

`lib/subscribers.ts`에 이어서 추가한다.

```ts
export async function confirmSubscriber(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'confirmed' })
    .eq('confirm_token', token)
    .select('email')

  if (error) {
    console.error('구독 확인 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'unsubscribed' })
    .eq('confirm_token', token)
    .select('email')

  if (error) {
    console.error('구독 해지 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: `getConfirmedSubscribers`의 실패하는 테스트 추가**

같은 파일에 추가한다.

```ts
describe('getConfirmedSubscribers', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('returns confirmed subscribers with their email and token', async () => {
    const eqMock = vi.fn().mockResolvedValue({
      data: [{ email: 'a@example.com', confirm_token: 't1' }],
      error: null,
    })
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) })

    const { getConfirmedSubscribers } = await import('../subscribers')
    const result = await getConfirmedSubscribers()

    expect(result).toEqual([{ email: 'a@example.com', confirm_token: 't1' }])
    expect(eqMock).toHaveBeenCalledWith('status', 'confirmed')
  })

  it('returns an empty array when the query errors', async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: new Error('down') })
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) })

    const { getConfirmedSubscribers } = await import('../subscribers')
    expect(await getConfirmedSubscribers()).toEqual([])
  })
})
```

- [ ] **Step 10: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: FAIL — `getConfirmedSubscribers` is not exported

- [ ] **Step 11: `getConfirmedSubscribers` 구현 추가**

```ts
export async function getConfirmedSubscribers(): Promise<{ email: string; confirm_token: string }[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .select('email, confirm_token')
    .eq('status', 'confirmed')

  if (error) {
    console.error('구독자 목록 조회 실패:', error)
    return []
  }
  return data ?? []
}
```

- [ ] **Step 12: 전체 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/subscribers.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 13: Commit**

```bash
git add lib/subscribers.ts lib/__tests__/subscribers.test.ts
git commit -m "feat: add subscriber create/confirm/unsubscribe/list helpers"
```

---

### Task 4: `lib/resend.ts` — 확인/발송 이메일 함수 추가

**Files:**
- Modify: `lib/resend.ts`
- Test: `lib/__tests__/resend.test.ts`

**Interfaces:**
- Consumes: `Resend` from `resend` 패키지 (기존 `sendRatesEmail`과 동일)
- Produces:
  - `sendConfirmationEmail(to: string, confirmUrl: string): Promise<void>` — Task 6에서 사용
  - `sendDigestEmail(to: string, buffer: Buffer, unsubscribeUrl: string): Promise<void>` — Task 9에서 사용

- [ ] **Step 1: 기존 테스트 파일 확인**

`lib/__tests__/resend.test.ts`를 열어 `sendRatesEmail`을 어떻게 모킹하는지 확인한다(이미 존재하는 파일이며, 아래 스텝에서 같은 모킹 패턴을 재사용한다).

Run: `npx vitest run lib/__tests__/resend.test.ts`
Expected: PASS (기존 테스트, 변경 전 baseline 확인용)

- [ ] **Step 2: `sendConfirmationEmail`의 실패하는 테스트 추가**

`lib/__tests__/resend.test.ts`에 아래 블록을 추가한다 (파일 상단의 `resend.emails.send` 모킹은 기존 코드를 그대로 재사용).

```ts
describe('sendConfirmationEmail', () => {
  it('sends a confirmation email containing the confirm URL', async () => {
    const { sendConfirmationEmail } = await import('../resend')
    await sendConfirmationEmail('user@example.com', 'https://example.com/api/subscribe/confirm?token=abc')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/subscribe/confirm?token=abc'),
      })
    )
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/resend.test.ts`
Expected: FAIL — `sendConfirmationEmail` is not exported

- [ ] **Step 4: `sendConfirmationEmail` 구현 추가**

`lib/resend.ts`에 이어서 추가한다.

```ts
export async function sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '[국고채 대시보드] 구독 확인',
    html: `<p>아래 링크를 클릭하면 매영업일 오후 5시 자동 발송 구독이 확정됩니다.</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
  })

  if (error) {
    throw new Error(`확인 이메일 발송 실패: ${error.message}`)
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/resend.test.ts`
Expected: PASS

- [ ] **Step 6: `sendDigestEmail`의 실패하는 테스트 추가**

```ts
describe('sendDigestEmail', () => {
  it('sends the digest with the excel attachment and unsubscribe link', async () => {
    const { sendDigestEmail } = await import('../resend')
    await sendDigestEmail('user@example.com', Buffer.from('data'), 'https://example.com/api/unsubscribe?token=abc')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/unsubscribe?token=abc'),
        attachments: [expect.objectContaining({ content: Buffer.from('data').toString('base64') })],
      })
    )
  })
})
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `npx vitest run lib/__tests__/resend.test.ts`
Expected: FAIL — `sendDigestEmail` is not exported

- [ ] **Step 8: `sendDigestEmail` 구현 추가**

```ts
export async function sendDigestEmail(to: string, buffer: Buffer, unsubscribeUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '국고채·통안채·CD 금리 데이터 (매영업일 자동 발송)',
    html: `<p>매영업일 자동 발송 데이터입니다.</p><p><a href="${unsubscribeUrl}">구독 해지</a></p>`,
    attachments: [{ filename: 'bond-yields-5y.xlsx', content: buffer.toString('base64') }],
  })

  if (error) {
    throw new Error(`발송 실패 (${to}): ${error.message}`)
  }
}
```

- [ ] **Step 9: 전체 테스트 통과 확인**

Run: `npx vitest run lib/__tests__/resend.test.ts`
Expected: PASS (전체)

- [ ] **Step 10: Commit**

```bash
git add lib/resend.ts lib/__tests__/resend.test.ts
git commit -m "feat: add sendConfirmationEmail and sendDigestEmail"
```

---

### Task 5: 환경 변수 문서화 — `NEXT_PUBLIC_SITE_URL`

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces: `NEXT_PUBLIC_SITE_URL` 환경 변수 — Task 6, 9에서 확인/해지 링크의 절대 URL을 만들 때 사용

- [ ] **Step 1: `.env.example`에 항목 추가**

```
# 이메일 내 확인/해지 링크를 만들 때 사용하는 배포 도메인 (예: https://bond-yield-dashboard.vercel.app)
NEXT_PUBLIC_SITE_URL=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document NEXT_PUBLIC_SITE_URL env var"
```

---

### Task 6: `POST /api/subscribe`

**Files:**
- Create: `app/api/subscribe/route.ts`
- Test: `app/api/__tests__/subscribe.test.ts`

**Interfaces:**
- Consumes: `createPendingSubscriber` (Task 3), `sendConfirmationEmail` (Task 4), `checkEmailRateLimit`/`recordEmailSend` from `lib/rateLimit.ts`
- Produces: `POST /api/subscribe` — Task 10(UI)에서 호출하는 엔드포인트

- [ ] **Step 1: 실패하는 테스트 작성**

`app/api/export/__tests__/email.test.ts`의 모킹 패턴을 그대로 따른다.

```ts
// app/api/__tests__/subscribe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  createPendingSubscriber: vi.fn().mockResolvedValue({ ok: true, token: 'test-token' }),
}))
vi.mock('@/lib/resend', () => ({ sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({
  checkEmailRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4 }),
  recordEmailSend: vi.fn().mockResolvedValue(undefined),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid email address', async () => {
    const { POST } = await import('../subscribe/route')
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('sends a confirmation email and returns ok:true on success', async () => {
    const { sendConfirmationEmail } = await import('@/lib/resend')
    const { POST } = await import('../subscribe/route')
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(vi.mocked(sendConfirmationEmail)).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('token=test-token')
    )
  })

  it('returns 429 when rate-limited', async () => {
    const { checkEmailRateLimit } = await import('@/lib/rateLimit')
    vi.mocked(checkEmailRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 })
    const { POST } = await import('../subscribe/route')
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(429)
  })

  it('returns 400 with the subscriber-service error when already subscribed', async () => {
    const { createPendingSubscriber } = await import('@/lib/subscribers')
    vi.mocked(createPendingSubscriber).mockResolvedValueOnce({
      ok: false,
      error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.',
    })
    const { POST } = await import('../subscribe/route')
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('이미 구독 중이거나 확인 대기 중인 이메일입니다.')
  })

  it('returns 500 when the confirmation email fails to send', async () => {
    const { sendConfirmationEmail } = await import('@/lib/resend')
    vi.mocked(sendConfirmationEmail).mockRejectedValueOnce(new Error('resend down'))
    const { POST } = await import('../subscribe/route')
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/__tests__/subscribe.test.ts`
Expected: FAIL — `Cannot find module '../subscribe/route'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// app/api/subscribe/route.ts
import { NextResponse } from 'next/server'
import { createPendingSubscriber } from '@/lib/subscribers'
import { sendConfirmationEmail } from '@/lib/resend'
import { checkEmailRateLimit, recordEmailSend } from '@/lib/rateLimit'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkEmailRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '잠시 후 다시 시도해주세요. (시간당 요청 횟수를 초과했습니다)' },
      { status: 429 }
    )
  }

  const result = await createPendingSubscriber(email)
  await recordEmailSend(ip)

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const confirmUrl = `${siteUrl}/api/subscribe/confirm?token=${result.token}`

  try {
    await sendConfirmationEmail(email, confirmUrl)
  } catch (err) {
    console.error('확인 이메일 발송 실패:', err)
    return NextResponse.json({ ok: false, error: '발송에 실패했어요, 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/__tests__/subscribe.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/subscribe/route.ts app/api/__tests__/subscribe.test.ts
git commit -m "feat: add POST /api/subscribe endpoint"
```

---

### Task 7: `GET /api/subscribe/confirm`

**Files:**
- Create: `app/api/subscribe/confirm/route.ts`
- Test: `app/api/subscribe/confirm/__tests__/confirm.test.ts`

**Interfaces:**
- Consumes: `confirmSubscriber` (Task 3)
- Produces: `GET /api/subscribe/confirm?token=...` — 이메일 본문의 확인 링크가 향하는 엔드포인트

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/subscribe/confirm/__tests__/confirm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  confirmSubscriber: vi.fn(),
}))

describe('GET /api/subscribe/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success message when the token is valid', async () => {
    const { confirmSubscriber } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriber).mockResolvedValue(true)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm?token=valid'))
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('구독이 확정되었습니다')
  })

  it('shows an error message when the token is invalid', async () => {
    const { confirmSubscriber } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriber).mockResolvedValue(false)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm?token=bad'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })

  it('shows an error message when no token is provided', async () => {
    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/subscribe/confirm/__tests__/confirm.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// app/api/subscribe/confirm/route.ts
import { NextResponse } from 'next/server'
import { confirmSubscriber } from '@/lib/subscribers'

function htmlPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>구독 확인</title></head><body><p>${message}</p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return htmlPage('유효하지 않은 링크입니다.')
  }

  const confirmed = await confirmSubscriber(token)
  return htmlPage(confirmed ? '구독이 확정되었습니다.' : '유효하지 않은 링크입니다.')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/subscribe/confirm/__tests__/confirm.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/subscribe/confirm/route.ts app/api/subscribe/confirm/__tests__/confirm.test.ts
git commit -m "feat: add GET /api/subscribe/confirm endpoint"
```

---

### Task 8: `GET /api/unsubscribe`

**Files:**
- Create: `app/api/unsubscribe/route.ts`
- Test: `app/api/unsubscribe/__tests__/unsubscribe.test.ts`

**Interfaces:**
- Consumes: `unsubscribeByToken` (Task 3)
- Produces: `GET /api/unsubscribe?token=...` — 발송 이메일 본문의 해지 링크가 향하는 엔드포인트

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// app/api/unsubscribe/__tests__/unsubscribe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  unsubscribeByToken: vi.fn(),
}))

describe('GET /api/unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success message when the token is valid', async () => {
    const { unsubscribeByToken } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByToken).mockResolvedValue(true)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/unsubscribe?token=valid'))
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('구독이 해지되었습니다')
  })

  it('shows an error message when the token is invalid', async () => {
    const { unsubscribeByToken } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByToken).mockResolvedValue(false)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/unsubscribe?token=bad'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/unsubscribe/__tests__/unsubscribe.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// app/api/unsubscribe/route.ts
import { NextResponse } from 'next/server'
import { unsubscribeByToken } from '@/lib/subscribers'

function htmlPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>구독 해지</title></head><body><p>${message}</p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return htmlPage('유효하지 않은 링크입니다.')
  }

  const unsubscribed = await unsubscribeByToken(token)
  return htmlPage(unsubscribed ? '구독이 해지되었습니다.' : '유효하지 않은 링크입니다.')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/unsubscribe/__tests__/unsubscribe.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/unsubscribe/route.ts app/api/unsubscribe/__tests__/unsubscribe.test.ts
git commit -m "feat: add GET /api/unsubscribe endpoint"
```

---

### Task 9: `GET /api/cron/send-digest` + Vercel Cron 스케줄

**Files:**
- Create: `app/api/cron/send-digest/route.ts`
- Modify: `vercel.json`
- Test: `app/api/cron/__tests__/send-digest.test.ts`

**Interfaces:**
- Consumes: `isHoliday` (Task 2), `getConfirmedSubscribers` (Task 3), `sendDigestEmail` (Task 4), `getRateSeries` from `lib/rates.ts`, `buildRatesWorkbook` from `lib/excel.ts`, `INSTRUMENTS` from `lib/instruments.ts`
- Produces: `GET /api/cron/send-digest` — Vercel Cron이 매영업일 KST 17:00에 호출

- [ ] **Step 1: 실패하는 테스트 작성**

`app/api/cron/backfill/__tests__/backfill.test.ts`의 인증 테스트 패턴을 재사용한다.

```ts
// app/api/cron/__tests__/send-digest.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/holidays', () => ({ isHoliday: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/subscribers', () => ({
  getConfirmedSubscribers: vi.fn().mockResolvedValue([
    { email: 'a@example.com', confirm_token: 'token-a' },
    { email: 'b@example.com', confirm_token: 'token-b' },
  ]),
}))
vi.mock('@/lib/resend', () => ({ sendDigestEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rates')>('@/lib/rates')
  return {
    ...actual,
    getRateSeries: vi.fn().mockResolvedValue([{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]),
  }
})

function makeRequest() {
  return new Request('http://localhost/api/cron/send-digest', {
    headers: { Authorization: 'Bearer test-secret' },
  })
}

describe('GET /api/cron/send-digest', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    vi.clearAllMocks()
  })

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('../send-digest/route')
    const res = await GET(new Request('http://localhost/api/cron/send-digest'))
    expect(res.status).toBe(401)
  })

  it('skips sending when today is a holiday', async () => {
    const { isHoliday } = await import('@/lib/holidays')
    vi.mocked(isHoliday).mockResolvedValueOnce(true)
    const { sendDigestEmail } = await import('@/lib/resend')

    const { GET } = await import('../send-digest/route')
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.skipped).toBe('holiday')
    expect(sendDigestEmail).not.toHaveBeenCalled()
  })

  it('sends the digest to every confirmed subscriber', async () => {
    const { GET } = await import('../send-digest/route')
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sent).toEqual(['a@example.com', 'b@example.com'])
    expect(body.failed).toEqual([])
  })

  it('isolates a send failure to that subscriber and keeps going', async () => {
    const { sendDigestEmail } = await import('@/lib/resend')
    vi.mocked(sendDigestEmail)
      .mockRejectedValueOnce(new Error('resend down'))
      .mockResolvedValueOnce(undefined)

    const { GET } = await import('../send-digest/route')
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.sent).toEqual(['b@example.com'])
    expect(body.failed).toEqual(['a@example.com'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/cron/__tests__/send-digest.test.ts`
Expected: FAIL — `Cannot find module '../send-digest/route'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// app/api/cron/send-digest/route.ts
import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { isHoliday } from '@/lib/holidays'
import { getConfirmedSubscribers } from '@/lib/subscribers'
import { sendDigestEmail } from '@/lib/resend'

function todayKstISODate(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = todayKstISODate()
  if (await isHoliday(today)) {
    return NextResponse.json({ date: today, skipped: 'holiday', sent: [], failed: [] })
  }

  const subscribers = await getConfirmedSubscribers()
  if (subscribers.length === 0) {
    return NextResponse.json({ date: today, skipped: 'no-subscribers', sent: [], failed: [] })
  }

  const allCodes = INSTRUMENTS.map((i) => i.code)
  const rows = await getRateSeries(allCodes, '5y')
  const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  const sent: string[] = []
  const failed: string[] = []

  for (const subscriber of subscribers) {
    try {
      const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${subscriber.confirm_token}`
      await sendDigestEmail(subscriber.email, buffer, unsubscribeUrl)
      sent.push(subscriber.email)
    } catch (err) {
      console.error(`발송 실패 (${subscriber.email}):`, err)
      failed.push(subscriber.email)
    }
  }

  return NextResponse.json({ date: today, sent, failed })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/cron/__tests__/send-digest.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: `vercel.json`에 크론 스케줄 추가**

```json
{
  "crons": [
    {
      "path": "/api/cron/update-rates",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/send-digest",
      "schedule": "0 8 * * 1-5"
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/send-digest/route.ts app/api/cron/__tests__/send-digest.test.ts vercel.json
git commit -m "feat: add send-digest cron for weekday 5pm KST delivery"
```

---

### Task 10: `components/SubscribePanel.tsx` + `Dashboard.tsx` 연결

**Files:**
- Create: `components/SubscribePanel.tsx`
- Test: `components/__tests__/SubscribePanel.test.tsx`
- Modify: `components/Dashboard.tsx`

**Interfaces:**
- Consumes: `POST /api/subscribe` (Task 6)
- Produces: `SubscribePanel` React 컴포넌트 — `Dashboard.tsx`에서 렌더링

- [ ] **Step 1: 실패하는 테스트 작성**

`components/__tests__/ExportPanel.test.tsx`의 패턴을 그대로 따른다.

```tsx
// components/__tests__/SubscribePanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SubscribePanel } from '../SubscribePanel'

describe('SubscribePanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
  })

  it('shows a confirmation-email message after subscribing', async () => {
    render(<SubscribePanel />)

    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '매영업일 자동 발송 구독하기' }))

    await waitFor(() => expect(screen.getByText(/확인 이메일을 보냈습니다/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      })
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' }),
    } as Response)

    render(<SubscribePanel />)
    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '매영업일 자동 발송 구독하기' }))

    await waitFor(() =>
      expect(screen.getByText('이미 구독 중이거나 확인 대기 중인 이메일입니다.')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run components/__tests__/SubscribePanel.test.tsx`
Expected: FAIL — `Cannot find module '../SubscribePanel'`

- [ ] **Step 3: 최소 구현 작성**

```tsx
// components/SubscribePanel.tsx
'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'success' | 'error'

export function SubscribePanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubscribe() {
    setStatus('sending')
    setMessage('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus('success')
        setMessage('확인 이메일을 보냈습니다. 메일함에서 링크를 클릭해주세요.')
      } else {
        setStatus('error')
        setMessage(json.error ?? '구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setStatus('error')
      setMessage('구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:flex-wrap sm:items-center">
      <label htmlFor="subscribe-email" className="sr-only">
        이메일 주소
      </label>
      <input
        id="subscribe-email"
        type="email"
        placeholder="이메일 주소 입력"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="이메일 주소"
        className="w-full rounded border border-gray-300 px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 sm:w-auto sm:flex-1 sm:py-1"
      />
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={status === 'sending' || !email}
        className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50 sm:py-1"
      >
        매영업일 자동 발송 구독하기
      </button>

      {message && (
        <span className={status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-600'}>{message}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run components/__tests__/SubscribePanel.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: `Dashboard.tsx`에 연결**

`components/Dashboard.tsx`에서 `ExportPanel` import 바로 아래에 import를 추가하고, `<ExportPanel .../>` 렌더링 바로 아래에 `<SubscribePanel />`을 추가한다.

```tsx
import { ExportPanel } from './ExportPanel'
import { SubscribePanel } from './SubscribePanel'
```

```tsx
      <ExportPanel selectedInstruments={selected} period={period} />

      <SubscribePanel />
```

- [ ] **Step 6: 기존 Dashboard 테스트가 깨지지 않는지 확인**

Run: `npx vitest run components/__tests__/Dashboard.test.tsx`
Expected: PASS (기존 3개 테스트 그대로 통과 — `SubscribePanel` 추가가 기존 동작에 영향 없음)

- [ ] **Step 7: 전체 테스트 스위트 실행**

Run: `npx vitest run`
Expected: PASS (전체)

- [ ] **Step 8: Commit**

```bash
git add components/SubscribePanel.tsx components/__tests__/SubscribePanel.test.tsx components/Dashboard.tsx
git commit -m "feat: add SubscribePanel and wire it into the dashboard"
```

---

## 배포 전 확인 사항 (구현 완료 후)

- Task 1의 마이그레이션 SQL을 Supabase 프로젝트에 직접 적용해야 한다 (자동화되지 않음).
- `.env`(로컬)와 Vercel 프로젝트 환경 변수에 `NEXT_PUBLIC_SITE_URL`을 실제 배포 도메인으로 설정해야 한다.
- 최초 배포 후, `holidays` 테이블에 남은 올해·다음 해 공휴일을 Supabase 테이블 편집기에서 수동으로 등록해야 한다 (등록 전까지는 공휴일 스킵 없이 평일마다 발송됨).
