import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rates')>('@/lib/rates')
  return {
    ...actual,
    getRateSeries: vi.fn().mockResolvedValue([{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]),
  }
})
vi.mock('@/lib/gmail', () => ({ sendRatesEmail: vi.fn().mockResolvedValue(undefined) }))
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

  it('falls back to the 5y period when given an invalid period string', async () => {
    const { getRateSeries } = await import('@/lib/rates')
    const { POST } = await import('../email/route')
    const res = await POST(
      makeRequest({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y"; DROP TABLE' })
    )
    expect(res.status).toBe(200)
    expect(vi.mocked(getRateSeries)).toHaveBeenCalledWith(['treasury_3y'], '5y')
  })

  it('records the send attempt even when sendRatesEmail throws, to prevent retry-flood past the rate limit', async () => {
    const { sendRatesEmail } = await import('@/lib/gmail')
    const { recordEmailSend } = await import('@/lib/rateLimit')
    vi.mocked(sendRatesEmail).mockRejectedValueOnce(new Error('gmail down'))

    const { POST } = await import('../email/route')
    const res = await POST(makeRequest({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y' }))

    expect(res.status).toBe(500)
    expect(recordEmailSend).toHaveBeenCalledWith('1.2.3.4')
  })
})
