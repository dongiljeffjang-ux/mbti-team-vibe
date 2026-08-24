# MBTI 팀 케미 분석기

팀원의 MBTI를 넣으면 강점 배합, 잠재 갈등, 역할 배분을 계산합니다.
**점수·비중·갈등 감지는 전부 규칙표 기반 코드**이고, **해설 문구만 Claude가** 씁니다.

---

## 구조

```
lib/rules.js          규칙표 + 결정론적 계산 (클라이언트·서버 공용)
api/narrative.js      Vercel 서버리스 — OpenAI GPT 프록시 + 캐시
src/App.jsx           UI
src/lib/supabase.js   공유 링크 저장·조회
src/styles.css
supabase/schema.sql   테이블 + RLS 정책
```

`lib/rules.js`를 양쪽이 함께 import합니다. 서버는 클라이언트가 보낸 점수를 믿지 않고
같은 모듈로 다시 계산한 뒤, 결과가 어긋나면 콘솔에 경고를 남깁니다.

---

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여넣고 실행
3. **Settings → API**에서 세 가지를 복사
   - Project URL
   - `anon` public key
   - `service_role` secret key

테이블은 두 개입니다.

| 테이블 | 용도 | 접근 |
|---|---|---|
| `narrative_cache` | 같은 팀 구성이면 Claude 재호출 안 함 | RLS 정책 없음 → 서버(service_role)만 |
| `team_analyses` | 공유 링크에 담긴 분석 결과 | anon은 **insert만**, 조회는 RPC로 한 건씩 |

`team_analyses`에 select 정책을 일부러 넣지 않았습니다. 정책을 열면 익명 사용자가
테이블 전체를 덤프할 수 있고 거기엔 팀원 실명이 들어 있습니다. 대신 slug를 인자로 받는
`get_shared_analysis()` security definer 함수로만 꺼냅니다. slug가 곧 열쇠입니다.

---

## 2. Vercel 배포

```bash
npm i -g vercel
vercel link
```

환경변수를 등록합니다. **접두사에 따라 노출 범위가 다릅니다.**

```bash
# 서버 전용 — 브라우저로 절대 안 나감
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY

# 클라이언트 번들에 그대로 박힘 (anon 키는 공개되어도 되는 키)
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
```

```bash
vercel --prod
```

> `VITE_` 접두사가 붙은 값은 빌드 시 JS 번들에 문자열로 인라인됩니다.
> `OPENAI_API_KEY`나 `SUPABASE_SERVICE_ROLE_KEY`에는 **절대 `VITE_`를 붙이지 마세요.**

---

## 3. 로컬 개발

```bash
npm install
cp .env.example .env.local   # 값 채우기
vercel dev                   # :3000 — API 함수까지 함께 뜸
```

Vite 단독(`npm run dev`)으로 띄우면 `/api` 요청이 `localhost:3000`으로 프록시됩니다.
`vercel dev`를 같이 켜지 않으면 해설만 실패하고, 점수·비중·갈등 감지는 그대로 나옵니다.

---

## 동작 방식

**코드가 계산하는 것**

- `AXIS_RULES` — 글자 → 4축(창의/실행/조율/분석) 가중치
- `PAIR_RULES` — 차원별 일치/불일치 점수 + 인지기능 공유 가산점 → 1:1 궁합 45~96점
- 팀 케미 = 1:1 궁합 평균 × 60% + 성향 균형도 × 40%
- 갈등 감지 11개 규칙, 팀 유형 12종 분류
- 보완도 = 합류 후 균형 40% + 기존 멤버 궁합 30% + 최약축 보강력 30%

**Claude가 쓰는 것**

계산된 JSON을 컨텍스트로 받아 강점 해설, 갈등 해결 조언, 협업 팁만 생성합니다.
숫자를 다시 계산하지 말라고 프롬프트에 명시했고, 강점·갈등을 병렬 호출해 응답 길이 제약을 피합니다.
호출이 실패해도 규칙표 기반 기본 문구로 폴백합니다.

---

## 운영 시 챙길 것

- **비용** — 캐시 미스 1건당 OpenAI 호출 2회. 같은 팀 구성이면 14일간 재사용합니다.
- **레이트 리밋 없음** — `/api/narrative`는 공개 엔드포인트입니다. 외부 공개 전에
  Vercel Firewall이나 IP 기준 제한을 붙이세요.
- **개인정보** — 공유 링크를 만들면 실명이 저장됩니다. 30일 후 만료되지만 실제 삭제는
  `purge_expired()`를 pg_cron으로 걸어야 일어납니다 (schema.sql 마지막 줄).
- MBTI는 진단 도구가 아닙니다. 채용·평가 근거로 쓰지 마세요.
