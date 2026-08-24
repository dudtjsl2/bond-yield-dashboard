import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { fetchEcosRate } from '@/lib/ecos'
import { getSupabaseAdmin } from '@/lib/supabase'

function todayKstYYYYMMDD(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// Vercel Cron never sends a `date` param, so the daily automatic run is
// unaffected. This override exists only for manual re-runs/testing against
// a specific past date (e.g. re-populating history the backfill route missed).
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateOverride = searchParams.get('date')
  const dateYYYYMMDD = dateOverride && /^\d{8}$/.test(dateOverride) ? dateOverride : todayKstYYYYMMDD()
  const isoDate = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`
  const supabase = getSupabaseAdmin()

  const updated: string[] = []
  const skipped: string[] = []

  // 이미 오늘치가 확인된 지표는 다시 조회하지 않고, 아직 안 들어온 지표만 ECOS에 조회한다.
  const { data: rowsBeforeFetch } = await supabase
    .from('bond_yields')
    .select('instrument, yield_pct')
    .eq('date', isoDate)

  const confirmedCodes = new Set((rowsBeforeFetch ?? []).map((r) => r.instrument))
  const instrumentsToFetch = INSTRUMENTS.filter((i) => !confirmedCodes.has(i.code))

  for (const instrument of instrumentsToFetch) {
    try {
      const result = await fetchEcosRate(instrument, dateYYYYMMDD)
      if (!result) {
        skipped.push(instrument.code)
        continue
      }

      const resultIsoDate = `${result.date.slice(0, 4)}-${result.date.slice(4, 6)}-${result.date.slice(6, 8)}`
      const { error } = await supabase
        .from('bond_yields')
        .upsert(
          { date: resultIsoDate, instrument: instrument.code, yield_pct: result.value },
          { onConflict: 'date,instrument' }
        )

      if (error) {
        skipped.push(instrument.code)
        continue
      }
      updated.push(instrument.code)
    } catch {
      skipped.push(instrument.code)
      continue
    }
  }

  const { data: todayRows } =
    instrumentsToFetch.length > 0
      ? await supabase.from('bond_yields').select('instrument, yield_pct').eq('date', isoDate)
      : { data: rowsBeforeFetch }

  const confirmedCodesAfterFetch = new Set((todayRows ?? []).map((r) => r.instrument))
  const allConfirmed = INSTRUMENTS.every((i) => confirmedCodesAfterFetch.has(i.code))

  let digestStatus:
    | 'triggered'
    | 'failed'
    | 'skipped-no-data'
    | 'skipped-incomplete'
    | 'skipped-no-url'
    | 'skipped-already-sent' = confirmedCodesAfterFetch.size === 0 ? 'skipped-no-data' : 'skipped-incomplete'

  // 지표 전부(INSTRUMENTS 전체)가 오늘치로 확인됐을 때만 발송을 시도한다.
  // 일부(예: CD금리)만 아직 없는 상태에서 발송하면 부분 발송 이메일이 나가므로,
  // 남은 지표는 5분 간격 GitHub Actions 재시도가 이 라우트를 다시 호출해 채운다.
  if (allConfirmed) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    if (!siteUrl) {
      digestStatus = 'skipped-no-url'
    } else {
      // date를 원자적으로 선점해 같은 날짜에 두 번 발송되는 것을 막는다.
      // 재시도 중복 호출이나 Vercel 크론과 GitHub Actions 재시도가 겹쳐도 하나만 통과한다.
      const { data: claimRows, error: claimError } = await supabase
        .from('digest_dispatch_log')
        .upsert({ date: isoDate }, { onConflict: 'date', ignoreDuplicates: true })
        .select()

      if (claimError) {
        console.error('다이제스트 발송 클레임 실패:', claimError)
        digestStatus = 'failed'
      } else if (!claimRows || claimRows.length === 0) {
        digestStatus = 'skipped-already-sent'
      } else {
        try {
          const res = await fetch(`${siteUrl}/api/cron/send-digest`, {
            headers: { Authorization: `Bearer ${secret}` },
          })
          if (res.ok) {
            digestStatus = 'triggered'
          } else {
            digestStatus = 'failed'
            await supabase.from('digest_dispatch_log').delete().eq('date', isoDate)
          }
        } catch (err) {
          console.error('다이제스트 이메일 발송 트리거 실패:', err)
          digestStatus = 'failed'
          await supabase.from('digest_dispatch_log').delete().eq('date', isoDate)
        }
      }
    }
  }

  return NextResponse.json({
    date: isoDate,
    updated,
    skipped,
    digestStatus,
  })
}
