# 국고채·통안채·CD 금리 대시보드

## 배포 전 준비물 (환경 변수)

Vercel 프로젝트의 Settings → Environment Variables에 아래 값을 모두 등록해야 합니다.

| 변수명 | 설명 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role key (절대 외부 노출 금지) |
| ECOS_API_KEY | 한국은행 ECOS API 인증키 |
| OPENROUTER_API_KEY | OpenRouter API 키 |
| RESEND_API_KEY | Resend API 키 |
| RESEND_FROM_EMAIL | Resend에 등록/인증한 발신 이메일 주소 |
| CRON_SECRET | 임의의 긴 랜덤 문자열 (Cron 요청 인증용) |

## 배포 절차

1. Supabase 프로젝트에서 `supabase/migrations/0001_init.sql`을 SQL Editor로 실행
2. GitHub 저장소에 이 코드를 push
3. Vercel에서 해당 저장소를 Import
4. 위 표의 환경 변수를 모두 등록
5. Deploy
6. 배포 완료 후 실제 URL로 접속해 아래 "배포 후 테스트" 항목을 확인
