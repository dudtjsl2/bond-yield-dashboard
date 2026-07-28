import nodemailer from 'nodemailer'
import type { LatestSummary } from './rates'

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

// Renders the "as of <date>" table shown in the email body, separate from
// the full-history attachment. Returns '' when there's no data yet, so
// callers can splice it into their HTML unconditionally.
function buildLatestTableHtml(latest: LatestSummary): string {
  if (!latest || latest.items.length === 0) return ''

  const rows = latest.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${item.label}</td>` +
        `<td style="padding:4px 8px;border:1px solid #ddd;">${item.yield_pct}%</td></tr>`
    )
    .join('')

  return (
    `<p>최근 업데이트: ${latest.date}</p>` +
    `<table style="border-collapse:collapse;margin-top:8px;">` +
    `<thead><tr><th style="padding:4px 8px;border:1px solid #ddd;">지표</th>` +
    `<th style="padding:4px 8px;border:1px solid #ddd;">금리(%)</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  )
}

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

export async function sendRatesEmail(
  to: string,
  buffer: Buffer,
  filename: string,
  latest: LatestSummary
): Promise<void> {
  const transporter = getTransporter()
  try {
    const subject = latest ? `국고채·통안채·CD 금리 데이터 (${latest.date} 기준)` : '국고채·통안채·CD 금리 데이터'
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject,
      html: `<p>요청하신 금리 데이터를 첨부파일로 보내드립니다.</p>${buildLatestTableHtml(latest)}`,
      attachments: [{ filename, content: buffer }],
    })
  } catch (err) {
    throw new Error(`이메일 발송 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendConfirmationEmail(to: string, code: string): Promise<void> {
  const transporter = getTransporter()
  try {
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject: '[국고채 대시보드] 구독 확인',
      html:
        `<p>대시보드 사이트에서 아래 이메일 주소와 확인 코드를 입력하면 매영업일 오후 5시 자동 발송 구독이 확정됩니다.</p>` +
        `<p>이메일: ${to}</p>` +
        `<p style="font-size:20px;font-weight:bold;letter-spacing:2px;">${code}</p>`,
    })
  } catch (err) {
    throw new Error(`확인 이메일 발송 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendDigestEmail(
  to: string,
  buffer: Buffer,
  latest: LatestSummary,
  unsubscribeCode: string
): Promise<void> {
  const transporter = getTransporter()
  try {
    const subject = latest
      ? `국고채·통안채·CD 금리 데이터 (${latest.date} 기준, 매영업일 자동 발송)`
      : '국고채·통안채·CD 금리 데이터 (매영업일 자동 발송)'
    await transporter.sendMail({
      to,
      from: process.env.GMAIL_USER,
      subject,
      html:
        `<p>매영업일 자동 발송 데이터입니다.</p>${buildLatestTableHtml(latest)}` +
        `<p>구독을 해지하려면 사이트에서 아래 이메일 주소와 코드를 입력해주세요.</p>` +
        `<p>이메일: ${to}</p>` +
        `<p style="font-size:20px;font-weight:bold;letter-spacing:2px;">${unsubscribeCode}</p>`,
      attachments: [{ filename: 'bond-yields-5y.xlsx', content: buffer }],
    })
  } catch (err) {
    throw new Error(`발송 실패 (${to}): ${err instanceof Error ? err.message : String(err)}`)
  }
}
