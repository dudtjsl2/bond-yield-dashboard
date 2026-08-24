# PRD — 국고채·통안채·CD 금리 대시보드

## 다이제스트 이메일 발송 규칙

- **발송 트리거**: `/api/cron/update-rates`가 그날(KST) `INSTRUMENTS`에 정의된 지표(국고채 1/2/3/5/10/20년, 통안증권 1년, CD금리 91일) **전부**를 확인했을 때만 `/api/cron/send-digest`를 호출한다. 일부 지표만 확인된 상태에서는 발송하지 않는다.
  - 과거 버그: "오늘치 데이터가 하나라도 있으면" 발송하는 조건이었고, CD금리 등 ECOS 갱신이 늦는 지표가 빠진 채 부분 발송되는 문제가 있었다. `hasAnyData` → 전 지표 확인(`allConfirmed`) 조건으로 수정함 ([app/api/cron/update-rates/route.ts](../app/api/cron/update-rates/route.ts)).
- **재시도**: Vercel Hobby 플랜은 크론이 하루 1회(`vercel.json`의 `"10 7 * * *"`, UTC 기준이라 KST 16:10)뿐이라 자체 재시도가 없다. GitHub Actions 워크플로(`.github/workflows/retry-update-rates.yml`)가 KST 16:15~18:55 동안 5분 간격으로 `/api/cron/update-rates`를 재호출해, 아직 확인되지 않은 지표만 다시 조회하고 전부 확인되면 그때 발송을 트리거한다.
- **중복 발송 방지**: 발송 직전 `digest_dispatch_log` 테이블(`date` PK)에 그날 날짜를 원자적으로 선점(upsert ... ignoreDuplicates)한다. 이미 선점된 날짜면 `skipped-already-sent`로 응답하고 재발송하지 않는다. `send-digest` 호출 자체가 실패하면 선점을 즉시 해제해 다음 재시도가 다시 시도할 수 있게 한다.
- **`digestStatus` 응답값**: `triggered` | `failed` | `skipped-no-data`(오늘치 지표가 아예 없음) | `skipped-incomplete`(일부 지표 미확인) | `skipped-no-url`(사이트 URL 미설정) | `skipped-already-sent`(중복 방지로 스킵).

## 관련 문서

- [docs/superpowers/specs/2026-07-28-recurring-email-digest-design.md](superpowers/specs/2026-07-28-recurring-email-digest-design.md) — 구독/확인/해지 및 `send-digest` 발송 로직 원설계
- [docs/superpowers/plans/2026-07-28-recurring-email-digest.md](superpowers/plans/2026-07-28-recurring-email-digest.md) — 구현 계획
