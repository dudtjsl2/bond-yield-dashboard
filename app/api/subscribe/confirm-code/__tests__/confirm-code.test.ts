import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  confirmSubscriberByCode: vi.fn(),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/subscribe/confirm-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/subscribe/confirm-code', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid email address', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'not-an-email', code: '123456' }))
    expect(res.status).toBe(400)
  })

  it('rejects a code that is not 6 digits', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com', code: 'abcdef' }))
    expect(res.status).toBe(400)
  })

  it('confirms and returns ok:true when the email+code match', async () => {
    const { confirmSubscriberByCode } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriberByCode).mockResolvedValue(true)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com', code: '123456' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns 400 when the email+code do not match', async () => {
    const { confirmSubscriberByCode } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriberByCode).mockResolvedValue(false)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com', code: '999999' }))
    expect(res.status).toBe(400)
  })
})
