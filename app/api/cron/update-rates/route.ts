import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { fetchEcosRate } from '@/lib/ecos'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateDailySummary } from '@/lib/openrouter'

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
// a specific past date (e.g. re-generating a summary for a date the
// backfill already populated).
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateOverride = searchParams.get('date')
  const dateYYYYMMDD = dateOverride && /^\d{8}$/.test(dateOverride) ? dateOverride : todayKstYYYYMMDD()
  const supabase = getSupabaseAdmin()

  const updated: string[] = []
  const skipped: string[] = []

  for (const instrument of INSTRUMENTS) {
    try {
      const result = await fetchEcosRate(instrument, dateYYYYMMDD)
      if (!result) {
        skipped.push(instrument.code)
        continue
      }

      const isoDate = `${result.date.slice(0, 4)}-${result.date.slice(4, 6)}-${result.date.slice(6, 8)}`
      const { error } = await supabase
        .from('bond_yields')
        .upsert({ date: isoDate, instrument: instrument.code, yield_pct: result.value }, { onConflict: 'date,instrument' })

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

  const isoDate = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`
  let summaryStatus: 'ok' | 'failed' | 'skipped' = 'skipped'

  if (updated.length > 0) {
    try {
      const { data: todayRows } = await supabase
        .from('bond_yields')
        .select('instrument, yield_pct')
        .eq('date', isoDate)

      // Find the single most recent prior date first, then fetch all rows for
      // exactly that date. Avoids mixing rows from more than one calendar
      // date (which could otherwise let an older date's value silently
      // override a newer one for a given instrument in the Map below).
      const { data: prevDateRows } = await supabase
        .from('bond_yields')
        .select('date')
        .lt('date', isoDate)
        .order('date', { ascending: false })
        .limit(1)

      const prevDate = prevDateRows?.[0]?.date ?? null
      const { data: yesterdayRows } = prevDate
        ? await supabase.from('bond_yields').select('instrument, yield_pct').eq('date', prevDate)
        : { data: [] as { instrument: string; yield_pct: number }[] }

      const prevByInstrument = new Map((yesterdayRows ?? []).map((r) => [r.instrument, r.yield_pct]))
      const summaryRows = (todayRows ?? []).map((r) => {
        const inst = INSTRUMENTS.find((i) => i.code === r.instrument)
        return {
          instrument: r.instrument,
          label: inst?.label ?? r.instrument,
          yield_pct: r.yield_pct,
          prevYieldPct: prevByInstrument.get(r.instrument) ?? null,
        }
      })

      const summaryText = await generateDailySummary(summaryRows, isoDate)
      const { error: summaryError } = await supabase
        .from('daily_summary')
        .upsert({ date: isoDate, summary_text: summaryText })

      if (summaryError) {
        console.error('AI 요약 저장 실패:', summaryError)
        summaryStatus = 'failed'
      } else {
        summaryStatus = 'ok'
      }
    } catch (err) {
      console.error('AI 요약 생성 실패:', err)
      summaryStatus = 'failed'
    }
  }

  let digestStatus: 'triggered' | 'failed' | 'skipped-no-data' | 'skipped-no-url' = 'skipped-no-data'

  if (updated.length > 0) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    if (!siteUrl) {
      digestStatus = 'skipped-no-url'
    } else {
      try {
        const res = await fetch(`${siteUrl}/api/cron/send-digest`, {
          headers: { Authorization: `Bearer ${secret}` },
        })
        digestStatus = res.ok ? 'triggered' : 'failed'
      } catch (err) {
        console.error('다이제스트 이메일 발송 트리거 실패:', err)
        digestStatus = 'failed'
      }
    }
  }

  return NextResponse.json({
    date: isoDate,
    updated,
    skipped,
    summaryStatus,
    digestStatus,
  })
}
