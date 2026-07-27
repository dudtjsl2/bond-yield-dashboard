import { getSupabaseAdmin } from './supabase'

export type Period = '1m' | '1y' | '5y' | 'all'

// Validates untrusted input (query params, JSON body) against the known
// Period values before it is ever used in filenames/headers, to avoid
// reflecting arbitrary strings (e.g. containing `"`) into response headers
// such as Content-Disposition.
export function parsePeriod(input: string | null | undefined): Period {
  return input === '1m' || input === '1y' || input === 'all' ? input : '5y'
}

function periodStartDate(period: Period): string | null {
  if (period === 'all') return null
  const now = new Date()
  const start = new Date(now)
  if (period === '1m') start.setMonth(start.getMonth() - 1)
  if (period === '1y') start.setFullYear(start.getFullYear() - 1)
  if (period === '5y') start.setFullYear(start.getFullYear() - 5)
  return start.toISOString().slice(0, 10)
}

export async function getRateSeries(instrumentCodes: string[], period: Period) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('bond_yields')
    .select('date, instrument, yield_pct')
    .in('instrument', instrumentCodes)
    .order('date', { ascending: true })

  const start = periodStartDate(period)
  if (start) {
    query = query.gte('date', start)
  }

  const { data, error } = await query
  if (error) throw new Error(`금리 데이터 조회 실패: ${error.message}`)
  return data ?? []
}

export async function getLatestSummary() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('daily_summary')
    .select('date, summary_text')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
}

export async function getLastUpdatedAt(): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('bond_yields')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data?.date ?? null
}
