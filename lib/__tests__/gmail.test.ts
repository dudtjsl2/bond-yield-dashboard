import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'abc' })
const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock })

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}))

describe('sendRatesEmail', () => {
  beforeEach(() => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'
    sendMailMock.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends an email with the buffer as an attachment', async () => {
    const { sendRatesEmail } = await import('../gmail')
    await sendRatesEmail('user@example.com', Buffer.from('fake-xlsx'), 'rates.xlsx')

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'sender@gmail.com',
        attachments: [expect.objectContaining({ filename: 'rates.xlsx' })],
      })
    )
  })

  it('throws when nodemailer rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('bad request'))
    const { sendRatesEmail } = await import('../gmail')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'rates.xlsx')).rejects.toThrow(/bad request/)
  })
})

describe('sendConfirmationEmail', () => {
  beforeEach(() => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'
    sendMailMock.mockClear()
  })

  it('sends a confirmation email containing the confirm URL', async () => {
    const { sendConfirmationEmail } = await import('../gmail')
    await sendConfirmationEmail('user@example.com', 'https://example.com/api/subscribe/confirm?token=abc')

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/subscribe/confirm?token=abc'),
      })
    )
  })
})

describe('sendDigestEmail', () => {
  beforeEach(() => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'
    sendMailMock.mockClear()
  })

  it('sends the digest with the excel attachment and unsubscribe link', async () => {
    const { sendDigestEmail } = await import('../gmail')
    await sendDigestEmail('user@example.com', Buffer.from('data'), 'https://example.com/api/unsubscribe?token=abc')

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        html: expect.stringContaining('https://example.com/api/unsubscribe?token=abc'),
        attachments: [expect.objectContaining({ filename: 'bond-yields-5y.xlsx' })],
      })
    )
  })
})

describe('getTransporter env guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws a clear error when GMAIL_USER is missing', async () => {
    delete process.env.GMAIL_USER
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'
    const { sendRatesEmail } = await import('../gmail')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'r.xlsx')).rejects.toThrow(/GMAIL_USER/)
  })

  it('throws a clear error when GMAIL_APP_PASSWORD is missing', async () => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    delete process.env.GMAIL_APP_PASSWORD
    const { sendRatesEmail } = await import('../gmail')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'r.xlsx')).rejects.toThrow(/GMAIL_APP_PASSWORD/)
  })
})
