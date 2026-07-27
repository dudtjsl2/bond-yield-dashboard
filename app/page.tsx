import { Dashboard } from '@/components/Dashboard'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries, getLatestSummary, getLastUpdatedAt } from '@/lib/rates'

// This page reads live data from Supabase and must reflect the daily cron
// job's updates on every request. Opt out of static generation so
// `next build` doesn't prerender (and freeze) this page, and so it doesn't
// require Supabase credentials at build time.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const allCodes = INSTRUMENTS.map((i) => i.code)
  const [rows, summary, lastUpdated] = await Promise.all([
    getRateSeries(allCodes, '5y'),
    getLatestSummary(),
    getLastUpdatedAt(),
  ])

  // Invariant: only show the AI summary as "오늘의 해설" if it was generated
  // for the same date as the latest rate data (lastUpdated). getLatestSummary()
  // always returns the newest row regardless of date, so if today's cron run
  // failed to generate a summary (or it's a non-business day), summary.date
  // will be older than lastUpdated — in that case pass null so SummaryBox
  // falls back to its "준비하지 못했어요" message instead of showing stale text.
  const todaysSummary = summary && summary.date === lastUpdated ? summary : null

  return (
    <Dashboard
      instruments={INSTRUMENTS}
      initialRows={rows}
      initialSummary={todaysSummary}
      initialLastUpdated={lastUpdated}
    />
  )
}
