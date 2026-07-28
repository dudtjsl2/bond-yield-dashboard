import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  unsubscribeByToken: vi.fn(),
}))

describe('GET /api/unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success message when the token is valid', async () => {
    const { unsubscribeByToken } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByToken).mockResolvedValue(true)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/unsubscribe?token=valid'))
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('구독이 해지되었습니다')
  })

  it('shows an error message when the token is invalid', async () => {
    const { unsubscribeByToken } = await import('@/lib/subscribers')
    vi.mocked(unsubscribeByToken).mockResolvedValue(false)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/unsubscribe?token=bad'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })
})
