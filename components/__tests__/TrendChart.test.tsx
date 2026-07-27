import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TrendChart } from '../TrendChart'

const instruments = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '', ecosItemCode1: '' },
]

describe('TrendChart', () => {
  it('shows an empty-state message when there is no data', () => {
    render(<TrendChart rows={[]} instruments={instruments} />)
    expect(screen.getByText(/데이터가 없습니다/)).toBeInTheDocument()
  })

  it('renders a chart container when data is present', () => {
    const rows = [{ date: '2026-07-27', instrument: 'treasury_3y', yield_pct: 2.85 }]
    render(<TrendChart rows={rows} instruments={instruments} />)
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument()
  })
})
