type Props = {
  summary: { date: string; summary_text: string } | null
}

export function SummaryBox({ summary }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-2 text-sm font-semibold">💬 오늘의 AI 해설</h2>
      {summary ? (
        <p className="text-sm">{summary.summary_text}</p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">오늘의 해설을 준비하지 못했어요.</p>
      )}
    </div>
  )
}
