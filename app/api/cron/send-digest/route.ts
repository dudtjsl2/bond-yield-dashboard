import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries, summarizeLatest } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { isHoliday } from '@/lib/holidays'
import { getConfirmedSubscribers } from '@/lib/subscribers'
import { sendDigestEmail } from '@/lib/gmail'

function todayKstISODate(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = todayKstISODate()

  if (await isHoliday(today)) {
    return NextResponse.json({ date: today, skipped: 'holiday', sent: [], failed: [] })
  }

  const subscribers = await getConfirmedSubscribers()
  if (subscribers.length === 0) {
    return NextResponse.json({ date: today, skipped: 'no-subscribers', sent: [], failed: [] })
  }

  const allCodes = INSTRUMENTS.map((i) => i.code)
  const rows = await getRateSeries(allCodes, '5y')
  const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
  const latest = summarizeLatest(rows, INSTRUMENTS)

  const sent: string[] = []
  const failed: string[] = []

  for (const subscriber of subscribers) {
    try {
      await sendDigestEmail(subscriber.email, buffer, latest, subscriber.short_code)
      sent.push(subscriber.email)
    } catch (err) {
      console.error(`발송 실패 (${subscriber.email}):`, err)
      failed.push(subscriber.email)
    }
  }

  return NextResponse.json({ date: today, sent, failed })
}
