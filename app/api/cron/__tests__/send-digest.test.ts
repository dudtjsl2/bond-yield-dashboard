import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/holidays', () => ({ isHoliday: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/subscribers', () => ({
  getConfirmedSubscribers: vi.fn().mockResolvedValue([
    { email: 'a@example.com', confirm_token: 'token-a', short_code: '111111' },
    { email: 'b@example.com', confirm_token: 'token-b', short_code: '222222' },
  ]),
}))
vi.mock('@/lib/gmail', () => ({ sendDigestEmail: vi.fn().mockResolvedValue(undefined) }))
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
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
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
    const { sendDigestEmail } = await import('@/lib/gmail')

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
    const { sendDigestEmail } = await import('@/lib/gmail')
    vi.mocked(sendDigestEmail)
      .mockRejectedValueOnce(new Error('gmail down'))
      .mockResolvedValueOnce(undefined)

    const { GET } = await import('../send-digest/route')
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.sent).toEqual(['b@example.com'])
    expect(body.failed).toEqual(['a@example.com'])
  })

  it('returns 500 when NEXT_PUBLIC_SITE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const { GET } = await import('../send-digest/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
