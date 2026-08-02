# 어제의 핵심

전날의 정치·사회·과학·IT·정보·경제 뉴스에서 중요한 사건만 골라 고등학생 수준으로 설명하고, 하루 세 번 다시 생각할 질문을 보내는 1인용 뉴스 PWA입니다.

## 로컬에서 바로 확인

Node.js 20 이상과 pnpm이 필요합니다.

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

`.env.local`에서 `DEMO_MODE=true`를 유지하면 NAVER, AI, Supabase key 없이 5개 분야 브리핑·세 알림·설정·아카이브를 확인할 수 있습니다. 데모 모드는 외부 뉴스/AI API를 호출하지 않습니다.

검증 명령:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## 운영 구성

- Next.js App Router + TypeScript strict + Tailwind CSS
- Vercel
- Supabase Postgres + Supabase Cron (`pg_cron`, `pg_net`, Vault)
- NAVER 뉴스 검색 API
- Vercel AI SDK + AI Gateway
- Web Push + VAPID + 직접 작성한 service worker

## 환경변수

`.env.example`을 `.env.local`로 복사하고 값을 채웁니다. 실제 `.env*` 파일은 Git에서 제외되며 `.env.example`만 저장소에 포함됩니다.

중요:

- `APP_PASSWORD`: 개인 로그인 비밀번호
- `AUTH_SECRET`: 16자 이상 무작위 문자열
- `DATABASE_URL`: Supabase의 Transaction pooler 또는 direct Postgres 연결 문자열
- `SUPABASE_SERVICE_ROLE_KEY`: 서버에서만 사용
- `AI_MODEL`: AI Gateway의 현재 모델 ID. 코드에 고정하지 않음
- `CRON_SECRET`: 긴 무작위 문자열
- `VAPID_SUBJECT`: `mailto:you@example.com` 또는 HTTPS URL
- 실제 운영은 `DEMO_MODE=false`

무작위 secret 예시 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

VAPID key 생성:

```bash
pnpm exec web-push generate-vapid-keys
```

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. Supabase CLI로 로그인하고 프로젝트를 연결합니다.
3. migration을 적용합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Scheduler migration은 Vault의 `app_url`, `cron_secret` 값을 참조합니다. SQL Editor에서 실제 값을 한 번 저장합니다.

```sql
select vault.create_secret('https://YOUR-APP.vercel.app', 'app_url');
select vault.create_secret('YOUR_LONG_CRON_SECRET', 'cron_secret');
```

이미 같은 이름이 있다면 Supabase Vault 화면에서 값을 갱신한 뒤 `202608020002_scheduler.sql`의 두 job이 등록됐는지 Integrations → Cron에서 확인합니다.

기본 스케줄은 UTC 기준입니다.

- `45 21 * * *` → 06:45 KST 뉴스 생성
- `*/10 * * * *` → 현재 KST 설정과 비교해 due Push만 전송

## NAVER와 AI 연결

NAVER Developers에서 검색 API 사용 애플리케이션을 만든 뒤 client ID/secret을 설정합니다. 서버는 공식 `GET https://openapi.naver.com/v1/search/news.json` 계약과 `X-Naver-Client-Id`, `X-Naver-Client-Secret` 헤더를 사용합니다.

Vercel AI Gateway key와 현재 모델 ID를 설정합니다. 모델은 `AI_MODEL=creator/model-name` 환경변수로만 받습니다. 앱은 설치된 AI SDK의 구조화 출력과 Zod 검증을 사용하며, 입력에 없는 사건·출처 ID는 저장하지 않습니다.

## Vercel 배포

Vercel 프로젝트를 연결하고 `.env.example`의 모든 운영 변수를 Development/Preview/Production 환경에 맞게 입력합니다. Preview에서 먼저 확인하세요.

```bash
pnpm exec vercel link
pnpm exec vercel env pull .env.local
pnpm exec vercel
```

Production 배포는 직접 확인 후 실행합니다.

```bash
pnpm exec vercel --prod
```

HTTPS가 아니면 PWA 설치와 Web Push가 정상 동작하지 않습니다.

## 내 Galaxy S26 Ultra에 설치하기

1. Supabase 프로젝트를 만들고 두 migration을 적용합니다.
2. NAVER 검색 API key를 준비합니다.
3. Vercel AI Gateway key와 `AI_MODEL`을 준비합니다.
4. `pnpm exec web-push generate-vapid-keys`로 VAPID key를 만듭니다.
5. Vercel 환경변수에 `.env.example` 값을 모두 입력하고 `DEMO_MODE=false`로 둡니다.
6. Preview 또는 production-like HTTPS 배포를 만듭니다.
7. Supabase Vault에 배포 URL과 `CRON_SECRET`을 저장하고 Cron job 두 개를 확인합니다.
8. Galaxy에서 배포 URL에 접속합니다.
9. Chrome: 메뉴 → 홈 화면에 추가 → 설치, 또는 Samsung Internet: 메뉴 → 현재 페이지 추가 → 홈 화면을 선택합니다.
10. 설치된 `어제의 핵심` 아이콘을 눌러 standalone 앱을 실행합니다.
11. 개인 비밀번호로 로그인합니다.
12. 설정 → `알림 켜기`를 누르고 Android 알림 권한을 허용합니다. 첫 진입 때는 권한 팝업이 나타나지 않습니다.
13. 설정 → `테스트 알림 보내기`를 누릅니다.
14. Galaxy notification shade에 `어제의 핵심 테스트`가 나타나는지 확인합니다.
15. 알림을 눌러 `/insights?focus=morning`으로 열리는지 확인합니다.
16. 다음 날 06:45 이후 브리핑 생성, 07:30/12:40/18:30 알림을 확인합니다.

## 운영 점검

설정 화면의 `설정 진단`은 secret 값을 노출하지 않고 다음만 보여줍니다.

- Database 연결 상태
- News API/AI 설정 여부
- Push 활성 구독 여부
- Scheduler 마지막 실행
- 마지막 발행 digest

수동 재생성은 로그인된 설정 화면의 `어제 뉴스 다시 생성`만 사용합니다. Cron endpoint는 `Authorization: Bearer CRON_SECRET` 없이는 실행되지 않습니다.

실제 key가 있을 때 최소 smoke test는 Preview에서 설정 화면 진단을 확인한 뒤 수동 재생성 1회로 수행하세요. 비용이 드는 NAVER/AI 호출을 전체 브라우저 테스트에서 반복하지 않습니다.

## 주요 경로

- `supabase/migrations/`: 데이터 모델과 scheduler
- `lib/pipeline/run-daily-digest.ts`: 하루 뉴스 생성 canonical path
- `lib/digest/summarize-story.ts`: grounded AI 설명
- `lib/nudges/generate-daily-nudges.ts`: 세 알림 일괄 생성
- `lib/push/send-due-push.ts`: due Push와 멱등성
- `public/sw.js`: 오프라인 fallback, Push, notification deep link

실제 Android notification shade와 제조사별 설치 메뉴는 자동화 환경에서 대신 누를 수 없으므로 마지막 실기기 인증이 필요합니다.
