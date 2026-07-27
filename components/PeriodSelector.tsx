'use client'

import type { Period } from '@/lib/rates'

const OPTIONS: { value: Period; label: string }[] = [
  { value: '1m', label: '1개월' },
  { value: '1y', label: '1년' },
  { value: '5y', label: '5년' },
  { value: 'all', label: '전체' },
]

type Props = {
  value: Period
  onChange: (p: Period) => void
}

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? 'rounded bg-blue-600 px-3 py-1 text-sm text-white'
              : 'rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600'
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
