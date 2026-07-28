type Props = {
  summary: { date: string; summary_text: string } | null
}

export function SummaryBox({ summary }: Props) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-muted">오늘의 AI 해설</h2>
      {summary ? (
        <p className="text-[15px] leading-relaxed">{summary.summary_text}</p>
      ) : (
        <p className="text-[15px] text-muted">오늘의 해설을 준비하지 못했어요.</p>
      )}
    </div>
  )
}
