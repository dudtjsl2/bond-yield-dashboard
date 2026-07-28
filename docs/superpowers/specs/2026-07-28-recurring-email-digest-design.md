# 매영업일 자동 이메일 발송 구독 기능 설계

## 배경

현재 대시보드는 사용자가 직접 이메일을 입력하고 버튼을 눌러야 엑셀 데이터를 1회성으로 받을 수 있다.
매 영업일(주말·한국 공휴일 제외) 오후 5시(KST)에 자동으로 데이터를 이메일로 받아보고 싶은 사용자를 위해,
누구나 자유롭게 구독/해지할 수 있는 정기 발송 기능을 추가한다.

## 요구사항 요약

- 구독 대상: 특정 사용자 전용이 아니라, 누구나 이메일을 입력해 자유롭게 구독/해지 가능
- 발송 내용: 전 지표 × 5년 기간 고정 (구독자별 개인화 없음)
- 발송 시각: 매영업일(주말 + 한국 공휴일 제외) 오후 5시(KST)
- 공휴일 정보: Supabase 테이블에 등록해 관리자가 직접 유지보수
- 악용 방지: 이메일 입력만으로 즉시 구독되지 않고, 확인 이메일의 링크를 클릭해야 구독이 확정되는 더블 옵트인 방식
- 기존 1회성 "이메일로 받기" 버튼(`ExportPanel`)은 그대로 유지하고, 신규 구독 기능은 별도 컴포넌트로 분리

## 아키텍처 선택

기존에 시세 업데이트용 Vercel Cron(`vercel.json`의 `crons` 설정, `app/api/cron/update-rates`)이 이미 있으므로,
같은 Vercel Cron + `CRON_SECRET` 인증 패턴을 재사용한다. Supabase `pg_cron` 확장을 새로 들이는 대안도 있었지만,
기존 인프라와 일관성을 유지하는 것이 유지보수 측면에서 더 낫다고 판단해 Vercel Cron을 재사용하는 방식으로 결정했다.

## 데이터 모델 (Supabase 신규 테이블 2개)

### `email_subscribers`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid, PK | |
| `email` | text, unique | |
| `status` | text | `pending` \| `confirmed` \| `unsubscribed` |
| `confirm_token` | text | 확인/해지 링크에 사용하는 랜덤 토큰 |
| `created_at` | timestamptz | |

### `holidays`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `date` | date, PK | YYYY-MM-DD (KST 기준) |
| `name` | text | 공휴일 이름 (예: "설날") |

관리자가 Supabase 테이블 편집기에서 직접 등록/수정한다. 애플리케이션 코드에서 별도 CRUD UI는 만들지 않는다.

## 구독 / 확인 / 해지 흐름

1. **구독**: 사용자가 대시보드의 `SubscribePanel`에서 이메일을 입력하고 "매영업일 자동 발송 구독하기" 버튼 클릭
   → `POST /api/subscribe`
   → 이메일 형식 검증 (기존 `EMAIL_REGEX` 패턴 재사용)
   → IP 기준 rate limit 적용 (기존 `lib/rateLimit.ts` 재사용)
   → 이미 `pending` 또는 `confirmed` 상태인 이메일이면 에러 반환 ("이미 구독 중이거나 확인 대기 중인 이메일입니다")
   → `email_subscribers`에 `status='pending'`, 랜덤 `confirm_token`으로 upsert
   → 확인 링크(`/api/subscribe/confirm?token=...`)가 담긴 이메일을 Resend로 발송

2. **확인**: 사용자가 이메일의 확인 링크 클릭
   → `GET /api/subscribe/confirm?token=...`
   → 토큰이 일치하는 행을 찾아 `status='confirmed'`로 갱신
   → 간단한 안내 페이지("구독이 확정되었습니다") 렌더링
   → 토큰이 없거나 이미 해지된 경우 "유효하지 않은 링크입니다" 안내

3. **해지**: 매영업일 발송되는 이메일 본문 하단에 해지 링크(`/api/unsubscribe?token=...`, 같은 `confirm_token` 재사용) 포함
   → `GET /api/unsubscribe?token=...`
   → `status='unsubscribed'`로 갱신
   → 안내 페이지("구독이 해지되었습니다") 렌더링
   → 사이트 내 별도 해지 UI는 만들지 않음 (일반적인 뉴스레터 패턴)

## 크론 & 공휴일 체크

- 신규 라우트: `app/api/cron/send-digest/route.ts`
- 인증: 기존 크론과 동일하게 `Authorization: Bearer ${CRON_SECRET}` 헤더 검사
- `vercel.json`의 `crons` 배열에 항목 추가: `{"path": "/api/cron/send-digest", "schedule": "0 8 * * 1-5"}` (UTC 08:00 = KST 17:00, 월~금)
- 실행 순서:
  1. 오늘 KST 날짜(YYYY-MM-DD)를 계산 (기존 `update-rates`의 `todayKstYYYYMMDD` 패턴과 동일한 방식, 날짜 포맷만 하이픈 포함으로 맞춤)
  2. `holidays` 테이블에서 해당 날짜 조회 → 있으면 `{ sent: [], skipped: 'holiday' }` 응답 후 즉시 종료 (발송 없음)
  3. 공휴일이 아니면 `email_subscribers`에서 `status='confirmed'`인 전체 구독자 조회
  4. 전 지표 × 5년 데이터로 엑셀 워크북 1회 생성 (`buildRatesWorkbook` 재사용, 구독자 수만큼 재생성하지 않음)
  5. 구독자별로 Resend 발송 (해지 링크 포함) — 한 명 실패해도 `catch`로 감싸 다음 구독자 계속 진행
  6. 최종 응답에 `sent`(성공한 이메일 목록)와 `failed`(실패한 이메일 목록) 반환 — 기존 `update-rates` 크론의 `updated`/`skipped` 패턴과 동일한 관찰성 유지

## UI 변경

- 신규 컴포넌트 `components/SubscribePanel.tsx` 추가
- 기존 `ExportPanel`과는 별도로 `Dashboard.tsx`에 나란히 배치 (1회성 발송과 정기 구독은 목적이 달라 컴포넌트를 분리)
- 이메일 입력창 + "매영업일 자동 발송 구독하기" 버튼
- 상태 메시지:
  - 성공: "확인 이메일을 보냈습니다. 메일함에서 링크를 클릭해주세요."
  - 이미 구독 중: "이미 구독 중이거나 확인 대기 중인 이메일입니다."
  - 일반 에러: 기존 `ExportPanel`과 동일한 한국어 에러 메시지 패턴 ("발송에 실패했어요, 잠시 후 다시 시도해주세요.")
- 기존 `ExportPanel`의 "이메일로 받기"(1회성 발송) 버튼은 변경 없이 그대로 유지

## 에러 처리 & 테스트 계획

- `POST /api/subscribe`: 기존 `lib/rateLimit.ts`의 IP 기반 rate limit 재사용
- 크론 발송: 구독자 단위로 실패를 격리(한 명 실패가 전체 발송을 막지 않음)
- 신규 테스트 파일:
  - `lib/__tests__/holidays.test.ts` — 공휴일 판별 로직 (해당 날짜 존재/없음, 주말 판별)
  - `app/api/__tests__/subscribe.test.ts` — 이메일 형식 검증, 중복 구독 방지, rate limit
  - `app/api/cron/__tests__/send-digest.test.ts` — 공휴일 스킵, 발송 성공/일부 실패 케이스

## 범위에서 제외한 것

- 구독자별 지표/기간 개인화 (전 지표 × 5년 고정으로 충분하다고 판단)
- 사이트 내 구독 관리(해지) UI (이메일 링크로 충분)
- 공휴일 정보의 외부 API 연동 (Supabase 테이블 수동 관리로 충분하다고 판단)
