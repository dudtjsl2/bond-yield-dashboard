import { NextResponse } from 'next/server'
import { getRateSeries, parsePeriod } from '@/lib/rates'
import { INSTRUMENTS } from '@/lib/instruments'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const instrumentsParam = searchParams.get('instruments')
  const period = parsePeriod(searchParams.get('period'))

  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = (instrumentsParam ? instrumentsParam.split(',') : INSTRUMENTS.map((i) => i.code)).filter((c) =>
    validCodes.has(c)
  )

  if (codes.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  try {
    const rows = await getRateSeries(codes, period)
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
