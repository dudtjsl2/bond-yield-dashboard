import { NextResponse } from 'next/server'
import { unsubscribeByCode } from '@/lib/subscribers'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_REGEX = /^\d{6}$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email
  const code = body?.code

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }
  if (typeof code !== 'string' || !CODE_REGEX.test(code)) {
    return NextResponse.json({ ok: false, error: '6자리 숫자 코드를 입력해주세요.' }, { status: 400 })
  }

  const unsubscribed = await unsubscribeByCode(email, code)
  if (!unsubscribed) {
    return NextResponse.json({ ok: false, error: '이메일 또는 코드가 올바르지 않습니다.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
