import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SummaryBox } from '../SummaryBox'

describe('SummaryBox', () => {
  it('shows the summary text when present', () => {
    render(<SummaryBox summary={{ date: '2026-07-27', summary_text: '오늘의 해설입니다.' }} />)
    expect(screen.getByText('오늘의 해설입니다.')).toBeInTheDocument()
  })

  it('shows a fallback message when summary is null', () => {
    render(<SummaryBox summary={null} />)
    expect(screen.getByText(/준비하지 못했어요/)).toBeInTheDocument()
  })
})
