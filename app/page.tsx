import { Dashboard } from '@/components/Dashboard'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries, getLastUpdatedAt } from '@/lib/rates'

// This page reads live data from Supabase and must reflect the daily cron
// job's updates on every request. Opt out of static generation so
// `next build` doesn't prerender (and freeze) this page, and so it doesn't
// require Supabase credentials at build time.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const allCodes = INSTRUMENTS.map((i) => i.code)
  const [rows, lastUpdated] = await Promise.all([getRateSeries(allCodes, '5y'), getLastUpdatedAt()])

  return <Dashboard instruments={INSTRUMENTS} initialRows={rows} initialLastUpdated={lastUpdated} />
}
