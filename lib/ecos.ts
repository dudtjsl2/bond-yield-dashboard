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

export async function fetchEcosRateRange(
  instrument: Instrument,
  startYYYYMMDD: string,
  endYYYYMMDD: string
): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.ECOS_API_KEY
  if (!apiKey) throw new Error('Missing env var: ECOS_API_KEY')

  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/3000/${instrument.ecosStatCode}/D/${startYYYYMMDD}/${endYYYYMMDD}/${instrument.ecosItemCode1}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`ECOS API 호출 실패 (status ${res.status}) for ${instrument.code}`)
  }

  const json = await res.json()
  const rows = json?.StatisticSearch?.row
  if (!rows || rows.length === 0) {
    return []
  }

  return rows.map((row: { TIME: string; DATA_VALUE: string }) => ({
    date: row.TIME,
    value: Number(row.DATA_VALUE),
  }))
}
