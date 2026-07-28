import { randomUUID, randomInt } from 'crypto'
import { getSupabaseAdmin } from './supabase'

type SubscribeResult = { ok: true; token: string; code: string } | { ok: false; error: string }

// 6-digit fallback for mail clients whose security gateway strips or
// blocks the confirm/unsubscribe link (e.g. Safe Links rewriting).
function generateShortCode(): string {
  return String(randomInt(100000, 1000000))
}

export async function createPendingSubscriber(email: string): Promise<SubscribeResult> {
  const supabase = getSupabaseAdmin()

  const { data: existing, error: selectError } = await supabase
    .from('email_subscribers')
    .select('status')
    .eq('email', email)
    .maybeSingle()

  if (selectError) {
    console.error('구독자 조회 실패:', selectError)
    return { ok: false, error: '잠시 후 다시 시도해주세요.' }
  }

  if (existing && (existing.status === 'pending' || existing.status === 'confirmed')) {
    return { ok: false, error: '이미 구독 중이거나 확인 대기 중인 이메일입니다.' }
  }

  const token = randomUUID()
  const code = generateShortCode()
  const { error: upsertError } = await supabase
    .from('email_subscribers')
    .upsert({ email, status: 'pending', confirm_token: token, short_code: code }, { onConflict: 'email' })

  if (upsertError) {
    console.error('구독 등록 실패:', upsertError)
    return { ok: false, error: '잠시 후 다시 시도해주세요.' }
  }

  return { ok: true, token, code }
}

export async function confirmSubscriber(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'confirmed' })
    .eq('confirm_token', token)
    .eq('status', 'pending')
    .select('email')

  if (error) {
    console.error('구독 확인 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'unsubscribed' })
    .eq('confirm_token', token)
    .select('email')

  if (error) {
    console.error('구독 해지 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

// Fallback path for confirm/unsubscribe links a mail security gateway
// blocks: matches on email + the 6-digit code shown in the email body,
// scoped by email so a 6-digit code alone isn't guessable across all
// subscribers.
export async function confirmSubscriberByCode(email: string, code: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'confirmed' })
    .eq('email', email)
    .eq('short_code', code)
    .eq('status', 'pending')
    .select('email')

  if (error) {
    console.error('코드 확인 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function unsubscribeByCode(email: string, code: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ status: 'unsubscribed' })
    .eq('email', email)
    .eq('short_code', code)
    .select('email')

  if (error) {
    console.error('코드 해지 실패:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}

export async function getConfirmedSubscribers(): Promise<
  { email: string; confirm_token: string; short_code: string }[]
> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .select('email, confirm_token, short_code')
    .eq('status', 'confirmed')

  if (error) {
    console.error('구독자 목록 조회 실패:', error)
    return []
  }
  return data ?? []
}
