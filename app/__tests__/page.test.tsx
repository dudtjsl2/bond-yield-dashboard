import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRateSeriesMock = vi.fn().mockResolvedValue([])
const getLatestSummaryMock = vi.fn()
const getLastUpdatedAtMock = vi.fn()

vi.mock('@/lib/rates', () => ({
  getRateSeries: getRateSeriesMock,
  getLatestSummary: getLatestSummaryMock,
  getLastUpdatedAt: getLastUpdatedAtMock,
}))

describe('Page (server component) - stale AI summary handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRateSeriesMock.mockResolvedValue([])
  })

  it('shows the AI summary when its date matches the latest rate data date', async () => {
    getLatestSummaryMock.mockResolvedValue({ date: '2026-07-27', summary_text: '오늘의 요약입니다.' })
    getLastUpdatedAtMock.mockResolvedValue('2026-07-27')

    const Page = (await import('../page')).default
    const element = await Page()
    render(element)

    expect(screen.getByText('오늘의 요약입니다.')).toBeInTheDocument()
  })

  it('hides a stale AI summary (older date than the latest rate data) and shows the fallback message', async () => {
    getLatestSummaryMock.mockResolvedValue({ date: '2026-07-24', summary_text: '지난 요약입니다.' })
    getLastUpdatedAtMock.mockResolvedValue('2026-07-27')

    const Page = (await import('../page')).default
    const element = await Page()
    render(element)

    expect(screen.queryByText('지난 요약입니다.')).not.toBeInTheDocument()
    expect(screen.getByText('오늘의 해설을 준비하지 못했어요.')).toBeInTheDocument()
  })
})
