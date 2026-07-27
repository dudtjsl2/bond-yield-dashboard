import { NextResponse } from 'next/server'
import { getRateSeries, type Period } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { INSTRUMENTS } from '@/lib/instruments'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = (searchParams.get('instruments') ?? '')
    .split(',')
    .filter((c) => validCodes.has(c))
  const period = (searchParams.get('period') as Period) ?? '5y'

  if (codes.length === 0) {
    return NextResponse.json({ error: '선택된 지표가 없습니다.' }, { status: 400 })
  }

  const rows = await getRateSeries(codes, period)
  const buffer = buildRatesWorkbook(rows, INSTRUMENTS)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bond-yields-${period}.xlsx"`,
    },
  })
}
