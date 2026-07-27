import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PeriodSelector } from '../PeriodSelector'

describe('PeriodSelector', () => {
  it('highlights the active period button', () => {
    render(<PeriodSelector value="5y" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '5년' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1년' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked period', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value="5y" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '전체' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
