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

  it('pages through results when a single page is full (3000 rows)', async () => {
    const fullPage = {
      StatisticSearch: {
        row: Array.from({ length: 3000 }, (_, i) => ({ TIME: `2000${String(i).padStart(4, '0')}`, DATA_VALUE: '3.0' })),
      },
    }
    const lastPage = {
      StatisticSearch: {
        row: [{ TIME: '20260727', DATA_VALUE: '2.85' }],
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: true, json: async () => lastPage })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchEcosRateRange(INSTRUMENTS[0], '20000101', '20260727')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('/1/3000/')
    expect(fetchMock.mock.calls[1][0]).toContain('/3001/6000/')
    expect(result).toHaveLength(3001)
    expect(result[3000]).toEqual({ date: '20260727', value: 2.85 })
  })
})
