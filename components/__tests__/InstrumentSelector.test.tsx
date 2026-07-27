import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InstrumentSelector } from '../InstrumentSelector'

const instruments = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '', ecosItemCode1: '' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '', ecosItemCode1: '' },
]

describe('InstrumentSelector', () => {
  it('renders a checkbox per instrument, checked according to `selected`', () => {
    render(<InstrumentSelector instruments={instruments} selected={['treasury_3y']} onChange={() => {}} />)
    expect(screen.getByLabelText('국고채 3년')).toBeChecked()
    expect(screen.getByLabelText('CD금리 91일')).not.toBeChecked()
  })

  it('calls onChange with the updated selection when toggled', () => {
    const onChange = vi.fn()
    render(<InstrumentSelector instruments={instruments} selected={['treasury_3y']} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('CD금리 91일'))
    expect(onChange).toHaveBeenCalledWith(['treasury_3y', 'cd_91d'])
  })
})
