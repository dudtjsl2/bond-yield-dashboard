import { Resend } from 'resend'

export async function sendRatesEmail(to: string, buffer: Buffer, filename: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '국고채·통안채·CD 금리 데이터',
    html: '<p>요청하신 금리 데이터를 첨부파일로 보내드립니다.</p>',
    attachments: [{ filename, content: buffer.toString('base64') }],
  })

  if (error) {
    throw new Error(`이메일 발송 실패: ${error.message}`)
  }
}

export async function sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '[국고채 대시보드] 구독 확인',
    html: `<p>아래 링크를 클릭하면 매영업일 오후 5시 자동 발송 구독이 확정됩니다.</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
  })

  if (error) {
    throw new Error(`확인 이메일 발송 실패: ${error.message}`)
  }
}

export async function sendDigestEmail(to: string, buffer: Buffer, unsubscribeUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('Missing env var: RESEND_API_KEY')
  if (!from) throw new Error('Missing env var: RESEND_FROM_EMAIL')

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    to,
    from,
    subject: '국고채·통안채·CD 금리 데이터 (매영업일 자동 발송)',
    html: `<p>매영업일 자동 발송 데이터입니다.</p><p><a href="${unsubscribeUrl}">구독 해지</a></p>`,
    attachments: [{ filename: 'bond-yields-5y.xlsx', content: buffer.toString('base64') }],
  })

  if (error) {
    throw new Error(`발송 실패 (${to}): ${error.message}`)
  }
}
