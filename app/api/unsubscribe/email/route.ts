import { NextResponse } from 'next/server'
import { unsubscribeByEmail } from '@/lib/subscribers'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }

  const unsubscribed = await unsubscribeByEmail(email)
  if (!unsubscribed) {
    return NextResponse.json({ ok: false, error: '구독 중인 이메일이 아닙니다.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
