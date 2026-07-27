export type Instrument = {
  code: string
  label: string
  ecosStatCode: string
  ecosItemCode1: string
}

// 확인 필요: 아래 ecosItemCode1 값은 Step 1에서 실제 확인한 값으로 교체할 것
export const INSTRUMENTS: Instrument[] = [
  { code: 'treasury_3y', label: '국고채 3년', ecosStatCode: '817Y002', ecosItemCode1: '010200000' },
  { code: 'treasury_5y', label: '국고채 5년', ecosStatCode: '817Y002', ecosItemCode1: '010210000' },
  { code: 'treasury_10y', label: '국고채 10년', ecosStatCode: '817Y002', ecosItemCode1: '010220000' },
  { code: 'treasury_20y', label: '국고채 20년', ecosStatCode: '817Y002', ecosItemCode1: '010230000' },
  { code: 'msb_1y', label: '통안증권 1년', ecosStatCode: '817Y002', ecosItemCode1: '010150000' },
  { code: 'cd_91d', label: 'CD금리 91일', ecosStatCode: '817Y002', ecosItemCode1: '010502000' },
]

export function findInstrument(code: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.code === code)
}
