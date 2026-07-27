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

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dateYYYYMMDD = todayKstYYYYMMDD()
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

      const { data: yesterdayRows } = await supabase
        .from('bond_yields')
        .select('instrument, yield_pct')
        .lt('date', isoDate)
        .order('date', { ascending: false })
        .limit(INSTRUMENTS.length)

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
      await supabase.from('daily_summary').upsert({ date: isoDate, summary_text: summaryText })
      summaryStatus = 'ok'
    } catch (err) {
      console.error('AI 요약 생성 실패:', err)
      summaryStatus = 'failed'
    }
  }

  return NextResponse.json({
    date: isoDate,
    updated,
    skipped,
    summaryStatus,
  })
}
