import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEcosRate as fetchEcosRateMock } from '@/lib/ecos'
import { INSTRUMENTS } from '@/lib/instruments'

const upsertMock = vi.fn().mockResolvedValue({ error: null })

const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
const ltMock = vi.fn().mockReturnValue({ order: orderMock })
const bondYieldsEqMock = vi.fn().mockResolvedValue({ data: [], error: null })
const bondYieldsSelectMock = vi.fn().mockReturnValue({ eq: bondYieldsEqMock, lt: ltMock })

// digest_dispatch_log: upsert(...).select() -> 클레임 성공 시 삽입된 행 1개 반환(기본값),
// ignoreDuplicates로 인해 이미 선점된 경우 빈 배열을 반환하도록 테스트별로 override.
const digestClaimSelectMock = vi.fn().mockResolvedValue({ data: [{ date: '2026-07-27' }], error: null })
const digestClaimUpsertMock = vi.fn().mockReturnValue({ select: digestClaimSelectMock })
const digestClaimDeleteEqMock = vi.fn().mockResolvedValue({ error: null })
const digestClaimDeleteMock = vi.fn().mockReturnValue({ eq: digestClaimDeleteEqMock })

const fromMock = vi.fn((table: string) => {
  if (table === 'digest_dispatch_log') {
    return { upsert: digestClaimUpsertMock, delete: digestClaimDeleteMock }
  }
  return { upsert: upsertMock, select: bondYieldsSelectMock }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}))

vi.mock('@/lib/ecos', () => ({
  fetchEcosRate: vi.fn(async (instrument) => {
    if (instrument.code === 'cd_91d') return null // 예: 해당 지표만 데이터 없음
    if (instrument.code === 'msb_1y') throw new Error('ECOS API error') // 예: 해당 지표만 호출 실패
    return { date: '20260727', value: 3.0 }
  }),
}))

function allInstrumentsRows() {
  return INSTRUMENTS.map((i) => ({ instrument: i.code, yield_pct: 3.0 }))
}

describe('GET /api/cron/update-rates', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    upsertMock.mockClear().mockResolvedValue({ error: null })
    fromMock.mockClear()
    bondYieldsSelectMock.mockClear()
    bondYieldsEqMock.mockClear().mockResolvedValue({ data: [], error: null })
    ltMock.mockClear()
    orderMock.mockClear()
    limitMock.mockClear()
    digestClaimSelectMock.mockClear().mockResolvedValue({ data: [{ date: '2026-07-27' }], error: null })
    digestClaimUpsertMock.mockClear()
    digestClaimDeleteEqMock.mockClear().mockResolvedValue({ error: null })
    digestClaimDeleteMock.mockClear()
    vi.mocked(fetchEcosRateMock).mockClear()
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_URL
  })

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('rejects a request whose header matches "Bearer undefined" when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer undefined' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('upserts rows for instruments with data and skips those without', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toContain('treasury_3y')
    expect(body.skipped).toContain('cd_91d')
    expect(fromMock).toHaveBeenCalledWith('bond_yields')
    expect(upsertMock).toHaveBeenCalled()
  })

  it('isolates a thrown error from fetchEcosRate to that instrument and still processes the rest', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toContain('msb_1y')
    expect(body.updated).toContain('treasury_3y')
    expect(body.updated).not.toContain('msb_1y')
  })

  it('includes digestStatus in the response', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect([
      'triggered',
      'failed',
      'skipped-no-data',
      'skipped-incomplete',
      'skipped-no-url',
      'skipped-already-sent',
    ]).toContain(body.digestStatus)
  })

  it('skips the digest trigger when no instrument has a row for today', async () => {
    // bondYieldsEqMock(오늘치 조회)은 기본값으로 빈 배열을 반환하도록 고정돼 있어
    // hasAnyData=false 경로를 검증한다.
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('skipped-no-data')
  })

  it('does not trigger the digest while some instruments (e.g. CD금리) are still missing for today', async () => {
    const [, ...partialRows] = INSTRUMENTS // 하나(CD금리 등)는 아직 없고 나머지는 있는 상태
    bondYieldsEqMock.mockResolvedValue({
      data: partialRows.map((i) => ({ instrument: i.code, yield_pct: 3.0 })),
      error: null,
    })
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.vercel.app'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('skipped-incomplete')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('triggers the digest once every instrument has a row for today', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.vercel.app'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('triggered')
    expect(fromMock).toHaveBeenCalledWith('digest_dispatch_log')
    vi.unstubAllGlobals()
  })

  it('does not re-send when the digest for today was already dispatched (dedup via digest_dispatch_log)', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.vercel.app'
    digestClaimSelectMock.mockResolvedValue({ data: [], error: null }) // ignoreDuplicates로 인해 이미 선점된 날짜는 빈 배열
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('skipped-already-sent')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('releases the digest_dispatch_log claim so a retry can re-attempt when the send-digest call fails', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.vercel.app'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('failed')
    expect(digestClaimDeleteMock).toHaveBeenCalled()
    expect(digestClaimDeleteEqMock).toHaveBeenCalledWith('date', expect.any(String))
    vi.unstubAllGlobals()
  })

  it('does not call ECOS again once every instrument already has a row for today', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).not.toHaveBeenCalled()
  })

  it('only queries ECOS for instruments that are still missing today\'s row', async () => {
    const [missing, ...alreadyConfirmed] = INSTRUMENTS
    bondYieldsEqMock.mockResolvedValue({
      data: alreadyConfirmed.map((i) => ({ instrument: i.code, yield_pct: 3.0 })),
      error: null,
    })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).toHaveBeenCalledTimes(1)
    expect(fetchEcosRateMock).toHaveBeenCalledWith(missing, expect.anything())
  })

  it('reports skipped-no-url when no site URL is configured for the digest trigger', async () => {
    bondYieldsEqMock.mockResolvedValue({ data: allInstrumentsRows(), error: null })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.digestStatus).toBe('skipped-no-url')
  })

  it('fetches the overridden date when a valid ?date= param is given', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates?date=20260726', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).toHaveBeenCalledWith(expect.anything(), '20260726')
  })

  it('ignores a malformed ?date= param and falls back to today', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/cron/update-rates?date=not-a-date', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    await GET(req)

    expect(fetchEcosRateMock).not.toHaveBeenCalledWith(expect.anything(), 'not-a-date')
  })
})
