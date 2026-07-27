import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateDailySummary } from '../openrouter'

describe('generateDailySummary', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns the model text on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '오늘 10년물 금리는 소폭 상승했습니다.' } }] }),
    }))

    const text = await generateDailySummary(
      [{ instrument: 'treasury_10y', label: '국고채 10년', yield_pct: 3.05, prevYieldPct: 3.03 }],
      '2026-07-27'
    )
    expect(text).toBe('오늘 10년물 금리는 소폭 상승했습니다.')
  })

  it('throws when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(
      generateDailySummary([{ instrument: 'treasury_10y', label: '국고채 10년', yield_pct: 3.05, prevYieldPct: null }], '2026-07-27')
    ).rejects.toThrow(/OpenRouter/)
  })
})
