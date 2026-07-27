import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildRatesWorkbook } from '../excel'
import { INSTRUMENTS } from '../instruments'

describe('buildRatesWorkbook', () => {
  it('produces a workbook with one row per data point and Korean headers', () => {
    const rows = [
      { date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 },
      { date: '2026-07-27', instrument: 'cd_91d', yield_pct: 3.5 },
    ]
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ 날짜: '2026-07-27', 금리: 2.85 })
  })
})
