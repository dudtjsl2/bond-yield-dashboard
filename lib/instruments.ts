export type Instrument = {
  code: string
  label: string
  ecosStatCode: string
  ecosItemCode1: string
}

// ECOS StatisticItemList API(817Y002)로 2026-07-27 실제 확인한 코드
export const INSTRUMENTS: Instrument[] = [
  { code: 'treasury_1y', label: '국고채 1년', ecosStatCode: '817Y002', ecosItemCode1: '010190000' },
  { code: 'treasury_2y', label: '국고채 2년', ecosStatCode: '817Y002', ecosItemCode1: '010195000' },
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '817Y002', ecosItemCode1: '010200000' },
  { code: 'treasury_5y', label: '국고채 5년', ecosStatCode: '817Y002', ecosItemCode1: '010200001' },
  { code: 'treasury_10y', label: '국고채 10년', ecosStatCode: '817Y002', ecosItemCode1: '010210000' },
  { code: 'treasury_20y', label: '국고채 20년', ecosStatCode: '817Y002', ecosItemCode1: '010220000' },
  { code: 'msb_1y', label: '통안증권 1년', ecosStatCode: '817Y002', ecosItemCode1: '010400001' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '817Y002', ecosItemCode1: '010502000' },
]

export function findInstrument(code: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.code === code)
}
