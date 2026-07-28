import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } }
  }),
}))

describe('sendRatesEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'dashboard@example.com'
    sendMock.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends an email with the buffer as a base64 attachment', async () => {
    const { sendRatesEmail } = await import('../resend')
    await sendRatesEmail('user@example.com', Buffer.from('fake-xlsx'), 'rates.xlsx')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'dashboard@example.com',
        attachments: [expect.objectContaining({ filename: 'rates.xlsx' })],
      })
    )
  })

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'bad request' } })
    const { sendRatesEmail } = await import('../resend')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'rates.xlsx')).rejects.toThrow(/bad request/)
  })
})

describe('sendConfirmationEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'dashboard@example.com'
    sendMock.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends a confirmation email containing the confirm URL', async () => {
    const { sendConfirmationEmail } = await import('../resend')
    await sendConfirmationEmail('user@example.com', 'https://example.com/api/subscribe/confirm?token=abc')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/subscribe/confirm?token=abc'),
      })
    )
  })
})

describe('sendDigestEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'dashboard@example.com'
    sendMock.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends the digest with the excel attachment and unsubscribe link', async () => {
    const { sendDigestEmail } = await import('../resend')
    await sendDigestEmail('user@example.com', Buffer.from('data'), 'https://example.com/api/unsubscribe?token=abc')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/unsubscribe?token=abc'),
        attachments: [expect.objectContaining({ content: Buffer.from('data').toString('base64') })],
      })
    )
  })
})
