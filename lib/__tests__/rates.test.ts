import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryResult = { data: [{ date: '2026-07-27', instrument: 'treasury_10y', yield_pct: 3.05 }], error: null }

const chain: any = {
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
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
    chain.range.mockClear()
    chain.then = (resolve: any) => resolve(queryResult)
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

  it('pages through results when a single response hits the page size', async () => {
    const PAGE_SIZE = 1000
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
      instrument: 'treasury_10y',
      yield_pct: 3,
    }))
    const partialPage = [{ date: '2026-07-27', instrument: 'treasury_10y', yield_pct: 3.05 }]

    let call = 0
    chain.then = (resolve: any) => {
      call += 1
      resolve(call === 1 ? { data: fullPage, error: null } : { data: partialPage, error: null })
    }

    const { getRateSeries } = await import('../rates')
    const rows = await getRateSeries(['treasury_10y'], 'all')

    expect(rows).toHaveLength(PAGE_SIZE + 1)
    expect(chain.range).toHaveBeenCalledWith(0, PAGE_SIZE - 1)
    expect(chain.range).toHaveBeenCalledWith(PAGE_SIZE, PAGE_SIZE * 2 - 1)
  })

  it('stops after a single page when results are under the page size', async () => {
    const { getRateSeries } = await import('../rates')
    const rows = await getRateSeries(['treasury_10y'], 'all')

    expect(rows).toEqual(queryResult.data)
    expect(chain.range).toHaveBeenCalledTimes(1)
  })
})

describe('summarizeLatest', () => {
  const instruments = [
    { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
    { code: 'msb_1y', label: '통안증권 1년', ecosStatCode: '', ecosItemCode1: '' },
  ]

  it('returns null when there are no rows', async () => {
    const { summarizeLatest } = await import('../rates')
    expect(summarizeLatest([], instruments)).toBeNull()
  })

  it('picks the most recent date and only that date\'s values, in instrument order', async () => {
    const { summarizeLatest } = await import('../rates')
    const rows = [
      { date: '2026-07-01', instrument: 'treasury_3y', yield_pct: 3.2 },
      { date: '2026-07-28', instrument: 'msb_1y', yield_pct: 2.98 },
      { date: '2026-07-28', instrument: 'treasury_3y', yield_pct: 3.15 },
    ]

    expect(summarizeLatest(rows, instruments)).toEqual({
      date: '2026-07-28',
      items: [
        { label: '국고채 3년', yield_pct: 3.15 },
        { label: '통안증권 1년', yield_pct: 2.98 },
      ],
    })
  })

  it('skips instruments with no value on the latest date', async () => {
    const { summarizeLatest } = await import('../rates')
    const rows = [{ date: '2026-07-28', instrument: 'treasury_3y', yield_pct: 3.15 }]

    expect(summarizeLatest(rows, instruments)).toEqual({
      date: '2026-07-28',
      items: [{ label: '국고채 3년', yield_pct: 3.15 }],
    })
  })
})
