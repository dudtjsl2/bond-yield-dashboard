import { NextResponse } from 'next/server'
import { createPendingSubscriber } from '@/lib/subscribers'
import { sendConfirmationEmail } from '@/lib/gmail'
import { checkEmailRateLimit, recordEmailSend } from '@/lib/rateLimit'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkEmailRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '잠시 후 다시 시도해주세요. (시간당 요청 횟수를 초과했습니다)' },
      { status: 429 }
    )
  }

  const result = await createPendingSubscriber(email)
  await recordEmailSend(ip)

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    console.error('Missing env var: NEXT_PUBLIC_SITE_URL')
    return NextResponse.json({ ok: false, error: '잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
  const confirmUrl = `${siteUrl}/api/subscribe/confirm?token=${result.token}`

  try {
    await sendConfirmationEmail(email, confirmUrl, result.code)
  } catch (err) {
    console.error('확인 이메일 발송 실패:', err)
    return NextResponse.json({ ok: false, error: '발송에 실패했어요, 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
