import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock })

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

vi.mock('@/lib/ecos', () => ({
  fetchEcosRateRange: vi.fn(async (instrument) => {
    if (instrument.code === 'cd_91d') return [] // 예: 해당 지표만 데이터 없음
    if (instrument.code === 'msb_1y') throw new Error('ECOS API error') // 예: 해당 지표만 호출 실패
    return [
      { date: '20210727', value: 2.5 },
      { date: '20260727', value: 3.0 },
    ]
  }),
}))

describe('GET /api/cron/backfill', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    upsertMock.mockClear()
    fromMock.mockClear()
  })

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/backfill')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('rejects a request whose header matches "Bearer undefined" when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/backfill', {
      headers: { Authorization: 'Bearer undefined' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('bulk-upserts historical rows for instruments with data and skips those without', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/backfill', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toContain('treasury_3y')
    expect(body.skipped).toContain('cd_91d')
    expect(body.skipped).toContain('msb_1y')
    expect(fromMock).toHaveBeenCalledWith('bond_yields')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ date: '2021-07-27', instrument: 'treasury_3y', yield_pct: 2.5 }),
        expect.objectContaining({ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 3.0 }),
      ]),
      { onConflict: 'date,instrument' }
    )
    expect(body.totalRows).toBeGreaterThan(0)
  })

  it('isolates a thrown error from fetchEcosRateRange to that instrument and still processes the rest', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/backfill', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toContain('msb_1y')
    expect(body.updated).toContain('treasury_3y')
  })
})
