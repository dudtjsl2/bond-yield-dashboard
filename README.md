# 국고채·통안채·CD 금리 대시보드

## 배포 전 준비물 (환경 변수)

Vercel 프로젝트의 Settings → Environment Variables에 아래 값을 모두 등록해야 합니다.

| 변수명 | 설명 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role key (절대 외부 노출 금지) |
| ECOS_API_KEY | 한국은행 ECOS API 인증키 |
| GMAIL_USER | 발신용 구글 이메일 주소 |
| GMAIL_APP_PASSWORD | 구글 계정 2단계 인증 켠 뒤 발급한 앱 비밀번호 (일반 로그인 비밀번호 아님) |
| CRON_SECRET | 임의의 긴 랜덤 문자열 (Cron 요청 인증용) |
| NEXT_PUBLIC_SITE_URL | (선택) 자동 발송 메일 본문에 넣을 사이트 주소. `update-rates`가 완료 직후 이메일 발송을 트리거할 때도 이 주소를 사용하며, 미설정 시 Vercel이 자동 주입하는 `VERCEL_URL`로 대체됨 |

## 배포 절차

1. Supabase 프로젝트에서 `supabase/migrations/0001_init.sql`, `0002_email_subscribers.sql`, `0003_subscriber_short_code.sql`을 순서대로 SQL Editor로 실행
2. GitHub 저장소에 이 코드를 push
3. Vercel에서 해당 저장소를 Import
4. 위 표의 환경 변수를 모두 등록
5. Deploy
6. 배포 완료 후 실제 URL로 접속해 아래 "배포 후 테스트" 항목을 확인

> **Gmail 앱 비밀번호 발급 방법**: 구글 계정 → 보안 → 2단계 인증 켜기(필수) → "앱 비밀번호" 검색 → 이름 임의 입력 후 생성 → 16자리 비밀번호를 `GMAIL_APP_PASSWORD`에 (공백 없이) 붙여넣기. 일반 로그인 비밀번호를 넣으면 인증이 거부됩니다.

> **구독 확인은 이메일 + 6자리 코드, 해지는 이메일만으로 처리됩니다.** 회사 메일 보안 게이트웨이가 링크를 차단해도 항상 동작합니다. 해지는 악용해도 스팸을 줄이는 방향이라 코드 없이 이메일만 확인합니다. `confirm_token` 컬럼은 과거 링크 방식의 잔재로 더 이상 사용되지 않지만 스키마 호환을 위해 계속 채워집니다.

> **`update-rates` cron은 매일 16:45(KST) 딱 1번만 실행됩니다** (`vercel.json`, Vercel Hobby 플랜은 cron을 하루 1회로 제한하므로 재시도 불가). 그 시점에 ECOS에서 확인되는 지표가 하나라도 있으면 그 데이터로 이메일 다이제스트 발송을 트리거합니다. 아직 안 올라온 지표는 그냥 스킵되고, 다음날 다시 시도됩니다. 이 엔드포인트를 같은 날짜에 수동으로 여러 번 호출하면 다이제스트가 중복 발송될 수 있으니 주의해주세요.

> **`holidays` 테이블은 배포 직후 비어 있습니다.** 관리자가 Supabase 테이블 편집기에서 한국 공휴일 데이터를 직접 입력하기 전까지는, 반복 이메일 다이제스트 cron이 공휴일에도 계속 발송됩니다.

> **이미 예전 버전의 `0001_init.sql`을 실제 Supabase 프로젝트에 실행하셨다면**, 아래 3줄(RLS 활성화)이 누락되어 있을 수 있습니다. Supabase SQL Editor에서 다시 실행해주세요.
>
> ```sql
> alter table bond_yields enable row level security;
> alter table daily_summary enable row level security;
> alter table email_send_log enable row level security;
> ```

## 알려진 이슈 (Known Issues)

- **`xlsx` (SheetJS) 패키지의 npm 레지스트리 취약점**: 이 프로젝트가 사용하는 `xlsx` 패키지는 npm에 공개된 보안 권고(prototype pollution, ReDoS)에 대한 패치 버전이 npm 레지스트리에는 게시되어 있지 않습니다(SheetJS가 npm 배포를 중단함). 이 앱은 `xlsx`를 새 워크북을 **작성(write)**하는 용도로만 사용하며, 사용자가 업로드한 워크북을 파싱하지 않으므로 실제 악용 가능성은 낮습니다. 향후 개선 방향으로 SheetJS 공식 CDN에서 패치된 버전을 받아쓰거나 `exceljs`로 마이그레이션하는 것을 고려할 수 있습니다.
