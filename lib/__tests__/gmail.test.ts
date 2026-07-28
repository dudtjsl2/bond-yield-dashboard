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

  it('sends an email with the buffer as an attachment and a latest-values table', async () => {
    const { sendRatesEmail } = await import('../gmail')
    const latest = { date: '2026-07-28', items: [{ label: '국고채 3년', yield_pct: 3.15 }] }
    await sendRatesEmail('user@example.com', Buffer.from('fake-xlsx'), 'rates.xlsx', latest)

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: 'sender@gmail.com',
        subject: expect.stringContaining('2026-07-28'),
        html: expect.stringContaining('2026-07-28'),
        attachments: [expect.objectContaining({ filename: 'rates.xlsx' })],
      })
    )
    const html = sendMailMock.mock.calls[0][0].html
    expect(html).toContain('국고채 3년')
    expect(html).toContain('3.15')
  })

  it('omits the table and date suffix when there is no latest data', async () => {
    const { sendRatesEmail } = await import('../gmail')
    await sendRatesEmail('user@example.com', Buffer.from('fake-xlsx'), 'rates.xlsx', null)

    const call = sendMailMock.mock.calls[0][0]
    expect(call.html).not.toContain('<table')
    expect(call.subject).toBe('국고채·통안채·CD 금리 데이터')
  })

  it('throws when nodemailer rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('bad request'))
    const { sendRatesEmail } = await import('../gmail')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'rates.xlsx', null)).rejects.toThrow(
      /bad request/
    )
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

  it('sends the digest with the excel attachment, unsubscribe link, and a latest-values table', async () => {
    const { sendDigestEmail } = await import('../gmail')
    const latest = { date: '2026-07-28', items: [{ label: '통안증권 1년', yield_pct: 2.98 }] }
    await sendDigestEmail(
      'user@example.com',
      Buffer.from('data'),
      'https://example.com/api/unsubscribe?token=abc',
      latest
    )

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('2026-07-28'),
        html: expect.stringContaining('https://example.com/api/unsubscribe?token=abc'),
        attachments: [expect.objectContaining({ filename: 'bond-yields-5y.xlsx' })],
      })
    )
    const html = sendMailMock.mock.calls[0][0].html
    expect(html).toContain('2026-07-28')
    expect(html).toContain('통안증권 1년')
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
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'r.xlsx', null)).rejects.toThrow(/GMAIL_USER/)
  })

  it('throws a clear error when GMAIL_APP_PASSWORD is missing', async () => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    delete process.env.GMAIL_APP_PASSWORD
    const { sendRatesEmail } = await import('../gmail')
    await expect(sendRatesEmail('user@example.com', Buffer.from('x'), 'r.xlsx', null)).rejects.toThrow(
      /GMAIL_APP_PASSWORD/
    )
  })
})
