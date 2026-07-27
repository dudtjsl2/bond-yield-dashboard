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
