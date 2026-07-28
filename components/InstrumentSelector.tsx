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
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">지표 선택</legend>
      {instruments.map((inst) => {
        const checked = selected.includes(inst.code)
        return (
          <label
            key={inst.code}
            className={
              checked
                ? 'cursor-pointer rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition'
                : 'cursor-pointer rounded-full bg-card px-3.5 py-1.5 text-sm font-medium text-muted shadow-sm transition hover:opacity-80'
            }
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(inst.code)}
              aria-label={inst.label}
              className="sr-only"
            />
            {inst.label}
          </label>
        )
      })}
    </fieldset>
  )
}
