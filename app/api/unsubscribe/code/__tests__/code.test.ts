import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  unsubscribeByCode: vi.fn(),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/unsubscribe/code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/unsubscribe/code', () => {
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

  it('unsubscribes and returns ok:true when the email+code match', async () => {
    const { unsubscribeByCode } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByCode).mockResolvedValue(true)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com', code: '123456' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns 400 when the email+code do not match', async () => {
    const { unsubscribeByCode } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByCode).mockResolvedValue(false)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ email: 'user@example.com', code: '999999' }))
    expect(res.status).toBe(400)
  })
})
