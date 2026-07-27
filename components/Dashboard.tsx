'use client'

import { useState } from 'react'
import { InstrumentSelector } from './InstrumentSelector'
import { PeriodSelector } from './PeriodSelector'
import { TrendChart } from './TrendChart'
import { SummaryBox } from './SummaryBox'
import { ThemeToggle } from './ThemeToggle'
import { ExportPanel } from './ExportPanel'
import type { Instrument } from '@/lib/instruments'
import type { Period } from '@/lib/rates'

type Row = { date: string; instrument: string; yield_pct: number }

type Props = {
  instruments: Instrument[]
  initialRows: Row[]
  initialSummary: { date: string; summary_text: string } | null
  initialLastUpdated: string | null
}

export function Dashboard({ instruments, initialRows, initialSummary, initialLastUpdated }: Props) {
  const [selected, setSelected] = useState<string[]>(instruments.map((i) => i.code))
  const [period, setPeriod] = useState<Period>('5y')
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refetch(nextSelected: string[], nextPeriod: Period) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ instruments: nextSelected.join(','), period: nextPeriod })
      const res = await fetch(`/api/rates?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error ?? '데이터를 불러오지 못했습니다.')
      }
      setRows(json.rows ?? [])
    } catch {
      // Keep whatever data was already displayed; always surface a Korean
      // user-facing message rather than a raw JS error (e.g. "Failed to
      // fetch") that a network-level failure would otherwise expose.
      setError('데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function handleInstrumentsChange(codes: string[]) {
    setSelected(codes)
    refetch(codes, period)
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p)
    refetch(selected, p)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📈 국고채·통안채·CD 금리 대시보드</h1>
        <ThemeToggle />
      </div>

      <InstrumentSelector instruments={instruments} selected={selected} onChange={handleInstrumentsChange} />
      <PeriodSelector value={period} onChange={handlePeriodChange} />

      {loading ? <p className="text-sm text-gray-500">불러오는 중...</p> : <TrendChart rows={rows} instruments={instruments} />}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <SummaryBox summary={initialSummary} />

      <ExportPanel selectedInstruments={selected} period={period} />

      <p className="text-xs text-gray-500 dark:text-gray-400">
        마지막 업데이트: {initialLastUpdated ?? '아직 없음'}
      </p>
    </div>
  )
}
