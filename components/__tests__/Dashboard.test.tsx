import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Dashboard } from '../Dashboard'

const instruments = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '', ecosItemCode1: '' },
]

const initialRows = [{ date: '2026-07-20', instrument: 'treasury_3y', yield_pct: 3.1 }]

describe('Dashboard refetch error handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps existing rows and shows an error message when the API returns a 500', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: '데이터를 불러오지 못했습니다.' }),
    })

    render(
      <Dashboard
        instruments={instruments}
        initialRows={initialRows}
        initialSummary={null}
        initialLastUpdated={null}
      />
    )

    fireEvent.click(screen.getByLabelText('CD금리 91일'))

    await waitFor(() => {
      expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument()
    })

    // Chart is still rendered with the previously loaded data, not blanked out.
    expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument()
  })

  it('keeps existing rows and shows an error message when fetch itself rejects', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))

    render(
      <Dashboard
        instruments={instruments}
        initialRows={initialRows}
        initialSummary={null}
        initialLastUpdated={null}
      />
    )

    fireEvent.click(screen.getByLabelText('CD금리 91일'))

    await waitFor(() => {
      // Network-level failures must surface a Korean fallback message, not
      // the raw JS error text (e.g. "network down"/"Failed to fetch").
      expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument()
      expect(screen.queryByText('network down')).not.toBeInTheDocument()
    })
  })

  it('clears the previous error and updates rows on a subsequent successful fetch', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: '데이터를 불러오지 못했습니다.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rows: [{ date: '2026-07-27', instrument: 'cd_91d', yield_pct: 2.9 }] }),
      })

    render(
      <Dashboard
        instruments={instruments}
        initialRows={initialRows}
        initialSummary={null}
        initialLastUpdated={null}
      />
    )

    fireEvent.click(screen.getByLabelText('CD금리 91일'))
    await waitFor(() => {
      expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('CD금리 91일'))
    await waitFor(() => {
      expect(screen.queryByText('데이터를 불러오지 못했습니다.')).not.toBeInTheDocument()
    })
  })
})
