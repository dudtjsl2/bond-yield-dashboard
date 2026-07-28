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
    <div className="rounded-2xl bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-muted">매영업일 자동 발송 구독</h2>
      <p className="mb-3 text-[13px] text-muted">주말·공휴일을 제외한 매영업일 오후 5시에 전 지표 데이터를 이메일로 보내드려요.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
          className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-inset ring-black/5 focus:ring-2 focus:ring-accent sm:flex-1 dark:ring-white/10"
        />
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={status === 'sending' || !email}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          매영업일 자동 발송 구독하기
        </button>
      </div>

      {message && (
        <p className={status === 'error' ? 'mt-2 text-sm text-red-500' : 'mt-2 text-sm text-accent'}>{message}</p>
      )}
    </div>
  )
}
