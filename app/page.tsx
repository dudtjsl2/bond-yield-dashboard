import { Dashboard } from '@/components/Dashboard'
import { INSTRUMENTS } from '@/lib/instruments'
import { getRateSeries, getLatestSummary, getLastUpdatedAt } from '@/lib/rates'

export default async function Page() {
  const allCodes = INSTRUMENTS.map((i) => i.code)
  const [rows, summary, lastUpdated] = await Promise.all([
    getRateSeries(allCodes, '5y'),
    getLatestSummary(),
    getLastUpdatedAt(),
  ])

  return (
    <Dashboard
      instruments={INSTRUMENTS}
      initialRows={rows}
      initialSummary={summary}
      initialLastUpdated={lastUpdated}
    />
  )
}
