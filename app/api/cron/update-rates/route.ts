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
  }

  return NextResponse.json({
    date: `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`,
    updated,
    skipped,
  })
}
