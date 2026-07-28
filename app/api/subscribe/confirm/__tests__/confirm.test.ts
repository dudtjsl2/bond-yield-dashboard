import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/subscribers', () => ({
  confirmSubscriber: vi.fn(),
}))

describe('GET /api/subscribe/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a success message when the token is valid', async () => {
    const { confirmSubscriber } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriber).mockResolvedValue(true)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm?token=valid'))
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain('구독이 확정되었습니다')
  })

  it('shows an error message when the token is invalid', async () => {
    const { confirmSubscriber } = await import('@/lib/subscribers')
    vi.mocked(confirmSubscriber).mockResolvedValue(false)

    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm?token=bad'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })

  it('shows an error message when no token is provided', async () => {
    const { GET } = await import('../route')
    const res = await GET(new Request('http://localhost/api/subscribe/confirm'))
    const html = await res.text()

    expect(html).toContain('유효하지 않은 링크입니다')
  })
})
