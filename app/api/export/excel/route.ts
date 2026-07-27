import { NextResponse } from 'next/server'
import { getRateSeries, parsePeriod } from '@/lib/rates'
import { buildRatesWorkbook } from '@/lib/excel'
import { INSTRUMENTS } from '@/lib/instruments'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const validCodes = new Set(INSTRUMENTS.map((i) => i.code))
  const codes = (searchParams.get('instruments') ?? '')
    .split(',')
    .filter((c) => validCodes.has(c))
  const period = parsePeriod(searchParams.get('period'))

  if (codes.length === 0) {
    return NextResponse.json({ error: '선택된 지표가 없습니다.' }, { status: 400 })
  }

  try {
    const rows = await getRateSeries(codes, period)
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bond-yields-${period}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('엑셀 생성 실패:', err)
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
