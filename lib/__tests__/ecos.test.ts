import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchEcosRate, fetchEcosRateRange } from '../ecos'
import { INSTRUMENTS } from '../instruments'

describe('fetchEcosRate', () => {
  beforeEach(() => {
    process.env.ECOS_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the parsed date and value when ECOS has data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        StatisticSearch: {
          row: [{ TIME: '20260727', DATA_VALUE: '2.850' }],
        },
      }),
    }))

    const result = await fetchEcosRate(INSTRUMENTS[0], '20260727')
    expect(result).toEqual({ date: '20260727', value: 2.85 })
  })

  it('returns null when ECOS has no row for that date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다' },
      }),
    }))

    const result = await fetchEcosRate(INSTRUMENTS[0], '20260726')
    expect(result).toBeNull()
  })

  it('throws when the HTTP call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(fetchEcosRate(INSTRUMENTS[0], '20260727')).rejects.toThrow(/ECOS/)
  })
})

describe('fetchEcosRateRange', () => {
  beforeEach(() => {
    process.env.ECOS_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all parsed rows when ECOS has data for the range', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        StatisticSearch: {
          row: [
            { TIME: '20260725', DATA_VALUE: '2.840' },
            { TIME: '20260727', DATA_VALUE: '2.850' },
          ],
        },
      }),
    }))

    const result = await fetchEcosRateRange(INSTRUMENTS[0], '20210727', '20260727')
    expect(result).toEqual([
      { date: '20260725', value: 2.84 },
      { date: '20260727', value: 2.85 },
    ])
  })

  it('returns an empty array when ECOS has no rows for the range', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다' },
      }),
    }))

    const result = await fetchEcosRateRange(INSTRUMENTS[0], '20210727', '20260727')
    expect(result).toEqual([])
  })

  it('throws when the HTTP call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(fetchEcosRateRange(INSTRUMENTS[0], '20210727', '20260727')).rejects.toThrow(/ECOS/)
  })
})
