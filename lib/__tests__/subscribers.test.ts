import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

describe('createPendingSubscriber', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('creates a pending subscriber with a fresh token when the email is new', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      upsert: upsertMock,
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('new@example.com')

    expect(result.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', status: 'pending' }),
      { onConflict: 'email' }
    )
  })

  it('rejects when the email is already pending or confirmed', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { status: 'confirmed' }, error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('existing@example.com')

    expect(result).toEqual({ ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' })
  })

  it('allows re-subscribing an email that previously unsubscribed', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { status: 'unsubscribed' }, error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      upsert: upsertMock,
    })

    const { createPendingSubscriber } = await import('../subscribers')
    const result = await createPendingSubscriber('back@example.com')

    expect(result.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalled()
  })
})

describe('confirmSubscriber', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('confirms the subscriber matching the token and returns true', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ email: 'a@example.com' }], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { confirmSubscriber } = await import('../subscribers')
    expect(await confirmSubscriber('valid-token')).toBe(true)
  })

  it('returns false when no row matches the token', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { confirmSubscriber } = await import('../subscribers')
    expect(await confirmSubscriber('bad-token')).toBe(false)
  })
})

describe('unsubscribeByToken', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('unsubscribes the matching row and returns true', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ email: 'a@example.com' }], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { unsubscribeByToken } = await import('../subscribers')
    expect(await unsubscribeByToken('valid-token')).toBe(true)
  })

  it('returns false when no row matches the token', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null })
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: selectMock }) }),
    })

    const { unsubscribeByToken } = await import('../subscribers')
    expect(await unsubscribeByToken('bad-token')).toBe(false)
  })
})

describe('getConfirmedSubscribers', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('returns confirmed subscribers with their email and token', async () => {
    const eqMock = vi.fn().mockResolvedValue({
      data: [{ email: 'a@example.com', confirm_token: 't1' }],
      error: null,
    })
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) })

    const { getConfirmedSubscribers } = await import('../subscribers')
    const result = await getConfirmedSubscribers()

    expect(result).toEqual([{ email: 'a@example.com', confirm_token: 't1' }])
    expect(eqMock).toHaveBeenCalledWith('status', 'confirmed')
  })

  it('returns an empty array when the query errors', async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: new Error('down') })
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) })

    const { getConfirmedSubscribers } = await import('../subscribers')
    expect(await getConfirmedSubscribers()).toEqual([])
  })
})
