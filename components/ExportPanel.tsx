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
    <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
      {hasSelection ? (
        <a
          href={`/api/export/excel?${excelParams.toString()}`}
          className="rounded bg-green-600 px-3 py-1 text-sm text-white"
        >
          📥 엑셀 다운로드
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-not-allowed rounded bg-green-600 px-3 py-1 text-sm text-white opacity-50"
        >
          📥 엑셀 다운로드
        </button>
      )}

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
        className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={status === 'sending' || !email}
        className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        이메일로 받기
      </button>

      {message && (
        <span className={status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-600'}>{message}</span>
      )}
    </div>
  )
}
