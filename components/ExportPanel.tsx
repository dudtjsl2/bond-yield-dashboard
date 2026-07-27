'use client'

type Props = {
  selectedInstruments: string[]
  period: string
}

export function ExportPanel({ selectedInstruments, period }: Props) {
  const params = new URLSearchParams({ instruments: selectedInstruments.join(','), period })

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
      <a
        href={`/api/export/excel?${params.toString()}`}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white"
      >
        📥 엑셀 다운로드
      </a>
    </div>
  )
}
