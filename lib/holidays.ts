import { getSupabaseAdmin } from './supabase'

export async function isHoliday(isoDate: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('kr_holidays')
    .select('date')
    .eq('date', isoDate)
    .maybeSingle()

  if (error) {
    // 조회 실패로 발송을 막는 것보다, 공휴일이 아니라고 간주하고 정상 발송하는
    // 쪽이 더 안전하다 (fail open) — 발송 안 되는 것보다 하루 더 발송되는 게 낫다.
    console.error('공휴일 조회 실패:', error)
    return false
  }
  return data !== null
}
