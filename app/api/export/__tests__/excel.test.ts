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
