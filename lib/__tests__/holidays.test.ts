import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingleMock = vi.fn()
const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
const fromMock = vi.fn().mockReturnValue({ select: selectMock })

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('isHoliday', () => {
  beforeEach(() => {
    fromMock.mockClear()
  })

  it('returns true when the date exists in the holidays table', async () => {
    maybeSingleMock.mockResolvedValue({ data: { date: '2026-09-28' }, error: null })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-09-28')).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('holidays')
  })

  it('returns false when the date is not a holiday', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-07-28')).toBe(false)
  })

  it('fails open (returns false) when the query errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: new Error('down') })
    const { isHoliday } = await import('../holidays')
    expect(await isHoliday('2026-07-28')).toBe(false)
  })
})
