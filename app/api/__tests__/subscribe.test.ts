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
