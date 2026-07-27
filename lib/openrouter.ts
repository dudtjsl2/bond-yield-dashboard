type SummaryRow = {
  instrument: string
  label: string
  yield_pct: number
  prevYieldPct: number | null
}

export async function generateDailySummary(rows: SummaryRow[], dateIso: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('Missing env var: OPENROUTER_API_KEY')

  const lines = rows
    .map((r) => {
      const diff = r.prevYieldPct == null ? '' : ` (전일 대비 ${(r.yield_pct - r.prevYieldPct).toFixed(3)}%p)`
      return `- ${r.label}: ${r.yield_pct}%${diff}`
    })
    .join('\n')

  const prompt = `아래는 ${dateIso} 기준 한국 채권/단기금리 현황이야. 비개발자도 이해할 수 있는 쉬운 한국어로 3~4문장 내로 오늘의 흐름을 요약해줘. 숫자를 과장하지 말고 사실만 담백하게 설명해줘.\n\n${lines}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenRouter API 호출 실패 (status ${res.status})`)
  }

  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter 응답에 내용이 없습니다')
  return text.trim()
}
