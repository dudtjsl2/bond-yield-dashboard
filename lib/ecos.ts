import type { Instrument } from './instruments'

export async function fetchEcosRate(
  instrument: Instrument,
  dateYYYYMMDD: string
): Promise<{ date: string; value: number } | null> {
  const apiKey = process.env.ECOS_API_KEY
  if (!apiKey) throw new Error('Missing env var: ECOS_API_KEY')

  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/1/${instrument.ecosStatCode}/D/${dateYYYYMMDD}/${dateYYYYMMDD}/${instrument.ecosItemCode1}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`ECOS API 호출 실패 (status ${res.status}) for ${instrument.code}`)
  }

  const json = await res.json()
  const rows = json?.StatisticSearch?.row
  if (!rows || rows.length === 0) {
    return null
  }

  const row = rows[0]
  return { date: row.TIME, value: Number(row.DATA_VALUE) }
}

const ECOS_PAGE_SIZE = 3000

export async function fetchEcosRateRange(
  instrument: Instrument,
  startYYYYMMDD: string,
  endYYYYMMDD: string
): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.ECOS_API_KEY
  if (!apiKey) throw new Error('Missing env var: ECOS_API_KEY')

  const allRows: { date: string; value: number }[] = []

  // ECOS StatisticSearch는 요청 구간당 최대 ECOS_PAGE_SIZE행만 돌려준다. 긴 구간(예: 과거
  // 전체 백필)을 한 번에 요청하면 앞부분만 잘려 들어오므로, 페이지가 가득 찰 때까지 반복 조회한다.
  for (let page = 0; ; page += 1) {
    const from = page * ECOS_PAGE_SIZE + 1
    const to = from + ECOS_PAGE_SIZE - 1
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/${from}/${to}/${instrument.ecosStatCode}/D/${startYYYYMMDD}/${endYYYYMMDD}/${instrument.ecosItemCode1}`

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`ECOS API 호출 실패 (status ${res.status}) for ${instrument.code}`)
    }

    const json = await res.json()
    const rows = json?.StatisticSearch?.row
    if (!rows || rows.length === 0) {
      break
    }

    allRows.push(
      ...rows.map((row: { TIME: string; DATA_VALUE: string }) => ({
        date: row.TIME,
        value: Number(row.DATA_VALUE),
      }))
    )

    if (rows.length < ECOS_PAGE_SIZE) {
      break
    }
  }

  return allRows
}
