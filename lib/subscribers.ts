import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from './supabase'

type SubscribeResult = { ok: true; token: string } | { ok: false; error: string }

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
  const { error: upsertError } = await supabase
    .from('email_subscribers')
    .upsert({ email, status: 'pending', confirm_token: token }, { onConflict: 'email' })

  if (upsertError) {
    console.error('구독 등록 실패:', upsertError)
    return { ok: false, error: '잠시 후 다시 시도해주세요.' }
  }

  return { ok: true, token }
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

export async function getConfirmedSubscribers(): Promise<{ email: string; confirm_token: string }[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_subscribers')
    .select('email, confirm_token')
    .eq('status', 'confirmed')

  if (error) {
    console.error('구독자 목록 조회 실패:', error)
    return []
  }
  return data ?? []
}
