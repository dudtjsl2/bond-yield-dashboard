import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SubscribePanel } from '../SubscribePanel'

describe('SubscribePanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
  })

  it('shows a confirmation-email message after subscribing', async () => {
    render(<SubscribePanel />)

    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '매영업일 자동 발송 구독하기' }))

    await waitFor(() => expect(screen.getByText(/확인 이메일을 보냈습니다/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      })
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' }),
    } as Response)

    render(<SubscribePanel />)
    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '매영업일 자동 발송 구독하기' }))

    await waitFor(() =>
      expect(screen.getByText('이미 구독 중이거나 확인 대기 중인 이메일입니다.')).toBeInTheDocument()
    )
  })
})
