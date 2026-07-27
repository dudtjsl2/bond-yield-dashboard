import { describe, it, expect, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn().mockReturnValue({
  select: () => ({
    eq: () => ({
      gte: selectMock,
    }),
  }),
  insert: insertMock,
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('checkEmailRateLimit', () => {
  beforeEach(() => {
    insertMock.mockClear()
  })

  it('allows the send when under the limit', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], error: null })
    const { checkEmailRateLimit } = await import('../rateLimit')
    const result = await checkEmailRateLimit('1.2.3.4', 5)
    expect(result).toEqual({ allowed: true, remaining: 3 })
  })

  it('blocks the send when at or over the limit', async () => {
    selectMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }], error: null })
    const { checkEmailRateLimit } = await import('../rateLimit')
    const result = await checkEmailRateLimit('1.2.3.4', 5)
    expect(result).toEqual({ allowed: false, remaining: 0 })
  })
})

describe('recordEmailSend', () => {
  it('inserts a log row for the given IP', async () => {
    const { recordEmailSend } = await import('../rateLimit')
    await recordEmailSend('1.2.3.4')
    expect(insertMock).toHaveBeenCalledWith({ ip_address: '1.2.3.4' })
  })
})
