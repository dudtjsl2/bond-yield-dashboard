import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportPanel } from '../ExportPanel'

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    )
  })

  it('shows a success message after sending', async () => {
    render(<ExportPanel selectedInstruments={['treasury_3y']} period="1y" />)

    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '이메일로 받기' }))

    await waitFor(() => expect(screen.getByText(/발송 완료/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/export/email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', instruments: ['treasury_3y'], period: '1y' }),
      })
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: '잠시 후 다시 시도해주세요.' }),
    } as Response)

    render(<ExportPanel selectedInstruments={['treasury_3y']} period="1y" />)
    fireEvent.change(screen.getByLabelText('이메일 주소'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '이메일로 받기' }))

    await waitFor(() => expect(screen.getByText('잠시 후 다시 시도해주세요.')).toBeInTheDocument())
  })
})
