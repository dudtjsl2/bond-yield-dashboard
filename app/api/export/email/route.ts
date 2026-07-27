import { NextResponse } from 'next/server'
import { getRateSeries, parsePeriod } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { sendRatesEmail } from '@/lib/resend'
import { checkEmailRateLimit, recordEmailSend } from '@/lib/rateLimit'
import { INSTRUMENTS } from '@/lib/instruments'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email
  const instruments: string[] = body?.instruments ?? []
  const period = parsePeriod(body?.period)

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
  }

  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = instruments.filter((c) => validCodes.has(c))
  if (codes.length === 0) {
    return NextResponse.json({ ok: false, error: '선택된 지표가 없습니다.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await checkEmailRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '잠시 후 다시 시도해주세요. (시간당 발송 횟수를 초과했습니다)' },
      { status: 429 }
    )
  }

  try {
    const rows = await getRateSeries(codes, period)
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    try {
      await sendRatesEmail(email, buffer, `bond-yields-${period}.xlsx`)
    } finally {
      // Record the attempt whether or not the send succeeded, so a caller
      // can't retry-flood past the rate limit just by causing Resend to fail.
      await recordEmailSend(ip)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('이메일 발송 실패:', err)
    return NextResponse.json({ ok: false, error: '발송에 실패했어요, 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
}
