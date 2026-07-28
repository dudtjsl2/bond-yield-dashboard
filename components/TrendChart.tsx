'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Instrument } from '@/lib/instruments'

type Row = { date: string; instrument: string; yield_pct: number }

type Props = {
  rows: Row[]
  instruments: Instrument[]
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

export function TrendChart({ rows, instruments }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">표시할 데이터가 없습니다.</p>
  }

  const byDate = new Map<string, Record<string, number | string>>()
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { date: row.date }
    entry[row.instrument] = row.yield_pct
    byDate.set(row.date, entry)
  }
  const chartData = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const presentCodes = Array.from(new Set(rows.map((r) => r.instrument)))

  return (
    <div data-testid="trend-chart" className="h-64 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: -10, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
          <YAxis unit="%" tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Legend />
          {presentCodes.map((code, i) => {
            const label = instruments.find((inst) => inst.code === code)?.label ?? code
            return (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={label}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
