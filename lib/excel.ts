import * as XLSX from 'xlsx'
import type { Instrument } from './instruments'

type Row = { date: string; instrument: string; yield_pct: number }

export function buildRatesWorkbook(rows: Row[], instruments: Instrument[]): Buffer {
  const labelByCode = new Map(instruments.map((i) => [i.code, i.label]))

  const sheetRows = rows
    .slice()
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      const aLabel = labelByCode.get(a.instrument) ?? a.instrument
      const bLabel = labelByCode.get(b.instrument) ?? b.instrument
      return aLabel.localeCompare(bLabel)
    })
    .map((r) => ({
      날짜: r.date,
      지표: labelByCode.get(r.instrument) ?? r.instrument,
      금리: r.yield_pct,
    }))

  const worksheet = XLSX.utils.json_to_sheet(sheetRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '금리데이터')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
