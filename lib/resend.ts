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
