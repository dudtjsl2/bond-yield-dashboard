import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEcosRate as fetchEcosRateMock } from '@/lib/ecos'
import { generateDailySummary as generateDailySummaryMock } from '@/lib/openrouter'
import { INSTRUMENTS } from '@/lib/instruments'

const upsertMock = vi.fn().mockResolvedValue({ error: null })

const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
const ltMock = vi.fn().mockReturnValue({ order: orderMock })
const bondYieldsEqMock = vi.fn().mockResolvedValue({ data: [], error: null })
const bondYieldsSelectMock = vi.fn().mockReturnValue({ eq: bondYieldsEqMock, lt: ltMock })
const bondYieldsFrom = { upsert: upsertMock, select: bondYieldsSelectMock }

const dailySummaryUpsertMock = vi.fn().mockResolvedValue({ error: null })
const dailySummaryEqMock = vi.fn().mockResolvedValue({ data: [], error: null })
const dailySummarySelectMock = vi.fn().mockReturnValue({ eq: dailySummaryEqMock })
const dailySummaryFrom = { upsert: dailySummaryUpsertMock, select: dailySummarySelectMock }

const fromMock = vi.fn((table: string) => (table === 'daily_summary' ? dailySummaryFrom : bondYieldsFrom))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

vi.mock('@/lib/ecos', () => ({
  fetchEcosRate: vi.fn(async (instrument) => {
    if (instrument.code === 'cd_91d') return null // 예: 해당 지표만 데이터 없음
    if (instrument.code === 'msb_1y') throw new Error('ECOS API error') // 예: 해당 지표만 호출 실패
    return { date: '20260727', value: 3.0 }
  }),
}))

vi.mock('@/lib/openrouter', () => ({
  generateDailySummary: vi.fn().mockResolvedValue('오늘의 요약입니다.'),
}))

function allInstrumentsRows() {
  return INSTRUMENTS.map((i) => ({ instrument: i.code, yield_pct: 3.0 }))
}

describe('GET /api/cron/update-rates', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    upsertMock.mockClear().mockResolvedValue({ error: null })
    dailySummaryUpsertMock.mockClear().mockResolvedValue({ error: null })
    fromMock.mockClear()
    bondYieldsSelectMock.mockClear()
    bondYieldsEqMock.mockClear().mockResolvedValue({ data: [], error: null })
    dailySummarySelectMock.mockClear()
    dailySummaryEqMock.mockClear().mockResolvedValue({ data: [], error: null })
    ltMock.mockClear()
    orderMock.mockClear()
    limitMock.mockClear()
    vi.mocked(generateDailySummaryMock).mockClear()
    vi.mocked(fetchEcosRateMock).mockClear()
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_URL
  })

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('rejects a request whose header matches "Bearer undefined" when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer undefined' },
    })
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

  it('isolates a thrown error from fetchEcosRate to that instrument and still processes the rest', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toContain('msb_1y')
    expect(body.updated).toContain('treasury_3y')
    expect(body.updated).not.toContain('msb_1y')
  })

  it('includes summaryStatus in the response', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(['ok', 'failed', 'skipped-incomplete', 'already-done']).toContain(body.summaryStatus)
  })

  it('does not generate a summary yet while today\'s data is still incomplete (retry-until-complete)', async () => {
    // bondYieldsEqMock (today rows) 기본값은 빈 배열 → INSTRUMENTS 전체가 아직 안 모인 상태
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.summaryStatus).toBe('skipped-incomplete')
    expect(body.digestStatus).toBe('skipped-incomplete')
    expect(generateDailySummaryMock).not.toHaveBeenCalled()
    expect(dailySummaryUpsertMock).not.toHaveBeenCalled()
  })

  it('generates the summary once every instrument has a row for today, without calling ECOS again', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.summaryStatus).toBe('ok')
    expect(generateDailySummaryMock).toHaveBeenCalled()
    expect(dailySummaryUpsertMock).toHaveBeenCalled()
    // 오늘치가 이미 전부 확인된 상태라 ECOS는 한 번도 조회하지 않아야 함
    expect(fetchEcosRateMock).not.toHaveBeenCalled()
  })

  it('only queries ECOS for instruments that are still missing today\'s row', async () => {
    const [missing, ...alreadyConfirmed] = INSTRUMENTS
    bondYieldsEqMock.mockResolvedValue({
      data: alreadyConfirmed.map((i) => ({ instrument: i.code, yield_pct: 3.0 })),
      error: null,
    })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).toHaveBeenCalledTimes(1)
    expect(fetchEcosRateMock).toHaveBeenCalledWith(missing, expect.anything())
  })

  it('sets summaryStatus to failed when the daily_summary upsert resolves with an error', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })
    dailySummaryUpsertMock.mockResolvedValueOnce({
      error: { message: 'permission denied for table daily_summary' },
    })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.summaryStatus).toBe('failed')
  })

  it('skips re-generating the summary and re-triggering the digest once today is already marked done', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })
    dailySummaryEqMock.mockResolvedValue({ data: [{ date: '2026-07-27' }], error: null })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.summaryStatus).toBe('already-done')
    expect(body.digestStatus).toBe('already-done')
    expect(generateDailySummaryMock).not.toHaveBeenCalled()
    expect(dailySummaryUpsertMock).not.toHaveBeenCalled()
    // 이미 완결된 날짜라 ECOS 조회를 아예 시도하지 않아야 함
    expect(fetchEcosRateMock).not.toHaveBeenCalled()
  })

  it('fetches the overridden date when a valid ?date= param is given', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates?date=20260726', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).toHaveBeenCalledWith(expect.anything(), '20260726')
  })

  it('ignores a malformed ?date= param and falls back to today', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates?date=not-a-date', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).not.toHaveBeenCalledWith(expect.anything(), 'not-a-date')
  })
})
