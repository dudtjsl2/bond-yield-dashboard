import { describe, it, expect, vi } from 'vitest'

const getRateSeriesMock = vi.fn().mockResolvedValue([{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }])

vi.mock('@/lib/rates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rates')>('@/lib/rates')
  return {
    ...actual,
    getRateSeries: getRateSeriesMock,
  }
})

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

  it('falls back to the 5y period when given an invalid period string', async () => {
    const { GET } = await import('../excel/route')
    const req = new Request(
      'http://localhost/api/export/excel?instruments=treasury_3y&period=' +
        encodeURIComponent('1y"; DROP TABLE')
    )
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('bond-yields-5y.xlsx')
  })

  it('returns a Korean 500 error when getRateSeries throws', async () => {
    getRateSeriesMock.mockRejectedValueOnce(new Error('supabase down'))
    const { GET } = await import('../excel/route')
    const req = new Request('http://localhost/api/export/excel?instruments=treasury_3y&period=1y')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('데이터를 불러오지 못했습니다.')
  })
})
