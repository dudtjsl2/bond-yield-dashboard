import { NextResponse } from 'next/server'
import { confirmSubscriber } from '@/lib/subscribers'

function htmlPage(message: string) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>구독 확인</title></head><body><p>${message}</p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return htmlPage('유효하지 않은 링크입니다.')
  }

  const confirmed = await confirmSubscriber(token)
  return htmlPage(confirmed ? '구독이 확정되었습니다.' : '유효하지 않은 링크입니다.')
}
