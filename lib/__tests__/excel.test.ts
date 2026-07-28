import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildRatesWorkbook } from '../excel'
import { INSTRUMENTS } from '../instruments'

describe('buildRatesWorkbook', () => {
  it('produces one row per date with one column per instrument (wide/pivot layout)', () => {
    const rows = [
      { date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 },
      { date: '2026-07-27', instrument: 'cd_91d', yield_pct: 3.5 },
      { date: '2026-07-28', instrument: 'treasury_3y', yield_pct: 2.9 },
    ]
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({ 날짜: '2026-07-27', '국고채 3년': 2.85, 'CD금리 91일': 3.5 })
    expect(data[1]).toMatchObject({ 날짜: '2026-07-28', '국고채 3년': 2.9 })
  })

  it('only includes columns for instruments actually present in rows', () => {
    const rows = [{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]
    const buffer = buildRatesWorkbook(rows, INSTRUMENTS)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    expect(data).toHaveLength(1)
    expect(Object.keys(data[0] as object)).toEqual(['날짜', '국고채 3년'])
  })
})
