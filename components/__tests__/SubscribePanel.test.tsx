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

  it('confirms via the fallback code form', async () => {
    render(<SubscribePanel />)

    fireEvent.click(screen.getByRole('button', { name: /코드로 확인\/해지하기/ }))
    fireEvent.change(screen.getByLabelText('코드 확인용 이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('확인 코드'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '코드로 구독 확인' }))

    await waitFor(() => expect(screen.getByText('구독이 확정되었습니다.')).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/subscribe/confirm-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      })
    )
  })

  it('unsubscribes via the fallback code form', async () => {
    render(<SubscribePanel />)

    fireEvent.click(screen.getByRole('button', { name: /코드로 확인\/해지하기/ }))
    fireEvent.change(screen.getByLabelText('코드 확인용 이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('확인 코드'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '코드로 구독 해지' }))

    await waitFor(() => expect(screen.getByText('구독이 해지되었습니다.')).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/unsubscribe/code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      })
    )
  })

  it('shows an error message when the code does not match', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: '이메일 또는 코드가 올바르지 않습니다.' }),
    } as Response)

    render(<SubscribePanel />)
    fireEvent.click(screen.getByRole('button', { name: /코드로 확인\/해지하기/ }))
    fireEvent.change(screen.getByLabelText('코드 확인용 이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('확인 코드'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: '코드로 구독 확인' }))

    await waitFor(() => expect(screen.getByText('이메일 또는 코드가 올바르지 않습니다.')).toBeInTheDocument())
  })
})
