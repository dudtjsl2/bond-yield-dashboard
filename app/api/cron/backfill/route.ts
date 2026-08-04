import { NextResponse } from 'next/server'
import { INSTRUMENTS } from '@/lib/instruments'
import { fetchEcosRateRange } from '@/lib/ecos'
import { getSupabaseAdmin } from '@/lib/supabase'

function todayKstYYYYMMDD(): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function yearsAgoKstYYYYMMDD(years: number): string {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  kst.setFullYear(kst.getFullYear() - years)
  const y = kst.getFullYear()
  const m = String(kst.getMonth() + 1).padStart(2, '0')
  const d = String(kst.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

const UPSERT_CHUNK_SIZE = 1000

// One-time manual backfill — NOT wired into the daily Vercel Cron schedule.
// Trigger by hand once (same Authorization header as /api/cron/update-rates)
// to populate history for a dashboard that has no data yet. The daily
// update-rates route is untouched and keeps fetching only "today" as before.
//
// Optional query params for a targeted re-run (e.g. backfilling a newly
// added instrument's full available history instead of every instrument's
// last 5 years):
//   ?instruments=treasury_1y,treasury_2y  — only these instrument codes
//   ?start=19900101                       — custom start date (YYYYMMDD).
//     ECOS simply returns whatever data actually exists from its real start
//     date onward, so an earlier-than-actual start date is safe to pass.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const instrumentCodes = searchParams.get('instruments')?.split(',').map((c) => c.trim())
  const instruments = instrumentCodes
    ? INSTRUMENTS.filter((i) => instrumentCodes.includes(i.code))
    : INSTRUMENTS

  const startOverride = searchParams.get('start')
  const endYYYYMMDD = todayKstYYYYMMDD()
  const startYYYYMMDD = startOverride && /^\d{8}$/.test(startOverride) ? startOverride : yearsAgoKstYYYYMMDD(5)
  const supabase = getSupabaseAdmin()

  const updated: string[] = []
  const skipped: string[] = []
  let totalRows = 0

  for (const instrument of instruments) {
    try {
      const rows = await fetchEcosRateRange(instrument, startYYYYMMDD, endYYYYMMDD)
      if (rows.length === 0) {
        skipped.push(instrument.code)
        continue
      }

      const payload = rows.map((r) => ({
        date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`,
        instrument: instrument.code,
        yield_pct: r.value,
      }))

      let hadError = false
      for (let i = 0; i < payload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = payload.slice(i, i + UPSERT_CHUNK_SIZE)
        const { error } = await supabase.from('bond_yields').upsert(chunk, { onConflict: 'date,instrument' })
        if (error) {
          hadError = true
          break
        }
      }

      if (hadError) {
        skipped.push(instrument.code)
        continue
      }
      updated.push(instrument.code)
      totalRows += payload.length
    } catch {
      skipped.push(instrument.code)
      continue
    }
  }

  return NextResponse.json({
    range: { start: startYYYYMMDD, end: endYYYYMMDD },
    updated,
    skipped,
    totalRows,
  })
}
