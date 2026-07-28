import nodemailer from 'nodemailer'

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user) throw new Error('Missing env var: GMAIL_USER')
  if (!pass) throw new Error('Missing env var: GMAIL_APP_PASSWORD')

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }
  return cachedTransporter
}

export async function sendRatesEmail(to: string, buffer: Buffer, filename: string): Promise<void> {
  const transporter = getTransporter()
  try {
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject: '국고채·통안채·CD 금리 데이터',
      html: '<p>요청하신 금리 데이터를 첨부파일로 보내드립니다.</p>',
      attachments: [{ filename, content: buffer }],
    })
  } catch (err) {
    throw new Error(`이메일 발송 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
  const transporter = getTransporter()
  try {
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject: '[국고채 대시보드] 구독 확인',
      html: `<p>아래 링크를 클릭하면 매영업일 오후 5시 자동 발송 구독이 확정됩니다.</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
    })
  } catch (err) {
    throw new Error(`확인 이메일 발송 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendDigestEmail(to: string, buffer: Buffer, unsubscribeUrl: string): Promise<void> {
  const transporter = getTransporter()
  try {
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject: '국고채·통안채·CD 금리 데이터 (매영업일 자동 발송)',
      html: `<p>매영업일 자동 발송 데이터입니다.</p><p><a href="${unsubscribeUrl}">구독 해지</a></p>`,
      attachments: [{ filename: 'bond-yields-5y.xlsx', content: buffer }],
    })
  } catch (err) {
    throw new Error(`발송 실패 (${to}): ${err instanceof Error ? err.message : String(err)}`)
  }
}
