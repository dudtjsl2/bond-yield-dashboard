'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'success' | 'error'

export function SubscribePanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubscribe() {
    setStatus('sending')
    setMessage('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus('success')
        setMessage('확인 이메일을 보냈습니다. 메일함에서 링크를 클릭해주세요.')
      } else {
        setStatus('error')
        setMessage(json.error ?? '구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setStatus('error')
      setMessage('구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:flex-wrap sm:items-center">
      <label htmlFor="subscribe-email" className="sr-only">
        이메일 주소
      </label>
      <input
        id="subscribe-email"
        type="email"
        placeholder="이메일 주소 입력"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="이메일 주소"
        className="w-full rounded border border-gray-300 px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 sm:w-auto sm:flex-1 sm:py-1"
      />
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={status === 'sending' || !email}
        className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50 sm:py-1"
      >
        매영업일 자동 발송 구독하기
      </button>

      {message && (
        <span className={status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-600'}>{message}</span>
      )}
    </div>
  )
}
