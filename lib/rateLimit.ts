import { getSupabaseAdmin } from './supabase'

export async function checkEmailRateLimit(ipAddress: string, maxPerHour = 5) {
  const supabase = getSupabaseAdmin()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('ip_address', ipAddress)
    .gte('created_at', oneHourAgo)

  if (error) {
    // Fail closed is too strict for a UX feature failure — fail open but log it.
    console.error('rate limit 조회 실패:', error)
    return { allowed: true, remaining: maxPerHour }
  }

  const count = data?.length ?? 0
  return { allowed: count < maxPerHour, remaining: Math.max(0, maxPerHour - count) }
}

export async function recordEmailSend(ipAddress: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('email_send_log').insert({ ip_address: ipAddress })
  if (error) {
    console.error('이메일 발송 기록 실패:', error)
  }
}
