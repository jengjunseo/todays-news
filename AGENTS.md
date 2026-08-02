# 어제의 핵심 — 프로젝트 운영 규칙

## Gate 운영

- Gate는 조사 → 계약 확정 → 구현 → 관련 검증 → Done 판정 순서로 진행한다.
- 앞 Gate가 Done 되기 전에 뒤 Gate 기능을 구현하지 않는다.
- 완료된 Gate는 직접적인 회귀가 없는 한 수정하지 않는다.
- Gate 중에는 해당 범위의 검증만 실행하고, 전체 lint/test/build/Playwright는 Final Certification에서 한 번 실행한다.
- 한 실패 명령을 변화 없이 반복하지 않는다. 한 문제에 대한 집중 수정은 최대 두 번이다.

## 제품 불변조건

- 기사와 사건을 구분하며 동일 사건은 한 digest에 한 번만 표시한다.
- 기사 전문 저장과 scraping을 하지 않는다.
- AI가 입력에 없는 URL, source ID, item ID를 만들거나 인용하지 못하게 서버에서 검증한다.
- 사실, 주장, 전망을 구분한다.
- 발행된 정상 digest는 새 생성 실패 때문에 삭제하지 않는다.
- digest와 Push는 멱등성을 보장한다.
- 저장 전 Zod로 검증한다.
- 모든 시간 계산은 Asia/Seoul 기준이다.
- API secret은 클라이언트 번들로 보내지 않고 `.env`를 commit하지 않는다.
- 기사 HTML을 그대로 렌더링하거나 `dangerouslySetInnerHTML`을 사용하지 않는다.
- 사용자 입력과 외부 URL을 신뢰하지 않는다.
- 자동 Push는 하루 최대 3회이며 긴급속보, FOMO, streak, 광고를 넣지 않는다.

## 구현 원칙

- 한 목적에는 하나의 대표 경로만 둔다.
- 외부 key가 없어도 Demo Mode, 자동 테스트, 설정 문서를 완성한다.
- TODO 버튼, 빈 handler, Production path의 가짜 구현을 남기지 않는다.
- 요청 밖 기능과 미래를 위한 추상화를 추가하지 않는다.
