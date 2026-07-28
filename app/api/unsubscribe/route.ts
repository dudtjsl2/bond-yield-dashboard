import { NextResponse } from 'next/server'
import { unsubscribeByToken } from '@/lib/subscribers'

function htmlPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>구독 해지</title></head><body><p>${message}</p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return htmlPage('유효하지 않은 링크입니다.')
  }

  const unsubscribed = await unsubscribeByToken(token)
  return htmlPage(unsubscribed ? '구독이 해지되었습니다.' : '유효하지 않은 링크입니다.')
}
