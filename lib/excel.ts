import * as XLSX from 'xlsx'
import type { Instrument } from './instruments'

type Row = { date: string; instrument: string; yield_pct: number }

// Wide/pivot layout: one row per date, one column per instrument (in the
// order given by `instruments`), rather than one row per (date, instrument)
// data point. Only instruments actually present in `rows` get a column.
export function buildRatesWorkbook(rows: Row[], instruments: Instrument[]): Buffer {
  const labelByCode = new Map(instruments.map((i) => [i.code, i.label]))
  const presentCodes = instruments.map((i) => i.code).filter((code) => rows.some((r) => r.instrument === code))

  const byDate = new Map<string, Record<string, string | number>>()
  for (const row of rows) {
    const label = labelByCode.get(row.instrument) ?? row.instrument
    const entry = byDate.get(row.date) ?? { 날짜: row.date }
    entry[label] = row.yield_pct
    byDate.set(row.date, entry)
  }

  const columnOrder = ['날짜', ...presentCodes.map((code) => labelByCode.get(code) ?? code)]
  // Descending — most recent date first.
  const sheetRows = Array.from(byDate.values()).sort((a, b) => String(b.날짜).localeCompare(String(a.날짜)))

  const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: columnOrder })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '금리데이터')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
