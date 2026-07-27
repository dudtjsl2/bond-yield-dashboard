'use client'

import type { Instrument } from '@/lib/instruments'

type Props = {
  instruments: Instrument[]
  selected: string[]
  onChange: (codes: string[]) => void
}

export function InstrumentSelector({ instruments, selected, onChange }: Props) {
  function toggle(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code))
    } else {
      onChange([...selected, code])
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="sr-only">지표 선택</legend>
      {instruments.map((inst) => (
        <label key={inst.code} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(inst.code)}
            onChange={() => toggle(inst.code)}
            aria-label={inst.label}
          />
          {inst.label}
        </label>
      ))}
    </fieldset>
  )
}
