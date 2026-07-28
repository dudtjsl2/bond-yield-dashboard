import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  unsubscribeByEmail: vi.fn(),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/unsubscribe/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/unsubscribe/email', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid email address', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('unsubscribes and returns ok:true when the email matches a subscriber', async () => {
    const { unsubscribeByEmail } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByEmail).mockResolvedValue(true)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns 400 when the email is not subscribed', async () => {
    const { unsubscribeByEmail } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByEmail).mockResolvedValue(false)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'nobody@example.com' }))
    expect(res.status).toBe(400)
  })
})
