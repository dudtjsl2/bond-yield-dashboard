'use client'

import { useState } from 'react'

type Props = {
  selectedInstruments: string[]
  period: string
}

type Status = 'idle' | 'sending' | 'success' | 'error'

export function ExportPanel({ selectedInstruments, period }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const excelParams = new URLSearchParams({ instruments: selectedInstruments.join(','), period })
  const hasSelection = selectedInstruments.length > 0

  async function handleSend() {
    setStatus('sending')
    setMessage('')
    try {
      const res = await fetch('/api/export/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, instruments: selectedInstruments, period }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus('success')
        setMessage('발송 완료!')
      } else {
        setStatus('error')
        setMessage(json.error ?? '발송에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setStatus('error')
      setMessage('발송에 실패했어요, 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-muted">엑셀 다운로드</h2>
        {hasSelection ? (
          <a
            href={`/api/export/excel?${excelParams.toString()}`}
            className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            선택한 지표 엑셀로 받기
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded-full bg-accent px-4 py-2 text-sm font-medium text-white opacity-40"
          >
            선택한 지표 엑셀로 받기
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-muted">이메일로 받기</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="export-email" className="sr-only">
            이메일 주소
          </label>
          <input
            id="export-email"
            type="email"
            placeholder="이메일 주소 입력"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="이메일 주소"
            className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-inset ring-black/5 focus:ring-2 focus:ring-accent sm:flex-1 dark:ring-white/10"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'sending' || !email}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            이메일로 받기
          </button>
        </div>

        {message && (
          <p className={status === 'error' ? 'mt-2 text-sm text-red-500' : 'mt-2 text-sm text-accent'}>{message}</p>
        )}
      </div>
    </div>
  )
}
