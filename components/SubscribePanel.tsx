'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'success' | 'error'

export function SubscribePanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const [codeEmail, setCodeEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<Status>('idle')
  const [codeMessage, setCodeMessage] = useState('')

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
        setMessage('확인 코드를 이메일로 보냈습니다. 아래에 이메일과 코드를 입력해 구독을 확정해주세요.')
        setCodeEmail(email)
      } else {
        setStatus('error')
        setMessage(json.error ?? '구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setStatus('error')
      setMessage('구독 신청에 실패했어요, 잠시 후 다시 시도해주세요.')
    }
  }

  async function handleCodeAction(path: '/api/subscribe/confirm-code' | '/api/unsubscribe/code', successMessage: string) {
    setCodeStatus('sending')
    setCodeMessage('')
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: codeEmail, code }),
      })
      const json = await res.json()
      if (json.ok) {
        setCodeStatus('success')
        setCodeMessage(successMessage)
      } else {
        setCodeStatus('error')
        setCodeMessage(json.error ?? '처리에 실패했어요, 잠시 후 다시 시도해주세요.')
      }
    } catch {
      setCodeStatus('error')
      setCodeMessage('처리에 실패했어요, 잠시 후 다시 시도해주세요.')
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

      <div className="mt-4 flex flex-col gap-2 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="text-[13px] font-semibold text-muted">이메일로 받은 코드로 구독 확인 / 해지</p>
        <label htmlFor="code-email" className="sr-only">
          코드 확인용 이메일 주소
        </label>
        <input
          id="code-email"
          type="email"
          placeholder="이메일 주소 입력"
          value={codeEmail}
          onChange={(e) => setCodeEmail(e.target.value)}
          aria-label="코드 확인용 이메일 주소"
          className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-inset ring-black/5 focus:ring-2 focus:ring-accent dark:ring-white/10"
        />
        <label htmlFor="code-input" className="sr-only">
          확인 코드
        </label>
        <input
          id="code-input"
          type="text"
          inputMode="numeric"
          placeholder="이메일로 받은 6자리 코드"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="확인 코드"
          className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-inset ring-black/5 focus:ring-2 focus:ring-accent dark:ring-white/10"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleCodeAction('/api/subscribe/confirm-code', '구독이 확정되었습니다.')}
            disabled={codeStatus === 'sending' || !codeEmail || !code}
            className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            코드로 구독 확인
          </button>
          <button
            type="button"
            onClick={() => handleCodeAction('/api/unsubscribe/code', '구독이 해지되었습니다.')}
            disabled={codeStatus === 'sending' || !codeEmail || !code}
            className="flex-1 rounded-full bg-card px-4 py-2 text-sm font-medium text-muted shadow-sm transition hover:opacity-80 disabled:opacity-40"
          >
            코드로 구독 해지
          </button>
        </div>
        {codeMessage && (
          <p className={codeStatus === 'error' ? 'text-sm text-red-500' : 'text-sm text-accent'}>{codeMessage}</p>
        )}
      </div>
    </div>
  )
}
