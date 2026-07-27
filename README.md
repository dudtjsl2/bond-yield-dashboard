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

> **이미 예전 버전의 `0001_init.sql`을 실제 Supabase 프로젝트에 실행하셨다면**, 아래 3줄(RLS 활성화)이 누락되어 있을 수 있습니다. Supabase SQL Editor에서 다시 실행해주세요.
>
> ```sql
> alter table bond_yields enable row level security;
> alter table daily_summary enable row level security;
> alter table email_send_log enable row level security;
> ```

## 알려진 이슈 (Known Issues)

- **`xlsx` (SheetJS) 패키지의 npm 레지스트리 취약점**: 이 프로젝트가 사용하는 `xlsx` 패키지는 npm에 공개된 보안 권고(prototype pollution, ReDoS)에 대한 패치 버전이 npm 레지스트리에는 게시되어 있지 않습니다(SheetJS가 npm 배포를 중단함). 이 앱은 `xlsx`를 새 워크북을 **작성(write)**하는 용도로만 사용하며, 사용자가 업로드한 워크북을 파싱하지 않으므로 실제 악용 가능성은 낮습니다. 향후 개선 방향으로 SheetJS 공식 CDN에서 패치된 버전을 받아쓰거나 `exceljs`로 마이그레이션하는 것을 고려할 수 있습니다.
