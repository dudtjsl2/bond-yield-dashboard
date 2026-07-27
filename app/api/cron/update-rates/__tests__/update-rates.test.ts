import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsertMock = vi.fn().mockResolvedValue({ error: null })

const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
const ltMock = vi.fn().mockReturnValue({ order: orderMock })
const eqMock = vi.fn().mockResolvedValue({ data: [], error: null })
const selectMock = vi.fn().mockReturnValue({ eq: eqMock, lt: ltMock })

const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock, select: selectMock })

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

describe('GET /api/cron/update-rates', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    upsertMock.mockClear()
    fromMock.mockClear()
    selectMock.mockClear()
    eqMock.mockClear()
    ltMock.mockClear()
    orderMock.mockClear()
    limitMock.mockClear()
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
    expect(['ok', 'failed', 'skipped']).toContain(body.summaryStatus)
  })

  it('sets summaryStatus to failed when the daily_summary upsert resolves with an error', async () => {
    upsertMock.mockImplementation((payload: Record<string, unknown>) => {
      if ('summary_text' in payload) {
        return Promise.resolve({ error: { message: 'permission denied for table daily_summary' } })
      }
      return Promise.resolve({ error: null })
    })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.summaryStatus).toBe('failed')

    upsertMock.mockResolvedValue({ error: null })
  })
})
