-- ════════════════════════════════════════════════════════════════
-- MBTI 팀 케미 분석기 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- ════════════════════════════════════════════════════════════════

-- ── 1. LLM 해설 캐시 ────────────────────────────────────────────
-- 같은 팀 구성이면 OpenAI를 다시 부르지 않는다.
create table if not exists public.narrative_cache (
  cache_key  text primary key,
  payload    jsonb       not null,
  model      text,
  created_at timestamptz not null default now()
);

alter table public.narrative_cache enable row level security;
-- 정책을 하나도 만들지 않는다 = anon/authenticated 모두 접근 불가.
-- service_role 키는 RLS를 우회하므로 api/narrative.js만 읽고 쓸 수 있다.

create index if not exists narrative_cache_created_idx
  on public.narrative_cache (created_at desc);


-- ── 2. 공유된 분석 결과 ─────────────────────────────────────────
create table if not exists public.team_analyses (
  id         uuid        primary key default gen_random_uuid(),
  slug       text        unique not null,
  team_name  text        not null default '',
  goal       text        not null,
  purpose    text        not null default '',
  members    jsonb       not null,   -- [{name, type, role, note}]
  result     jsonb       not null,   -- {chemistry, code, teamType}
  narrative  jsonb,                  -- {strengths, conflicts}
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.team_analyses enable row level security;

-- 익명 사용자는 "쓰기만" 가능하다.
drop policy if exists "anon can create share" on public.team_analyses;
create policy "anon can create share"
  on public.team_analyses for insert to anon
  with check (
    char_length(slug) between 8 and 24
    and jsonb_array_length(members) between 2 and 10
  );

-- select 정책은 일부러 만들지 않는다.
-- 정책이 있으면 anon이 테이블 전체를 덤프할 수 있고, 거기엔 팀원 실명이 들어 있다.
-- 대신 slug를 인자로 받는 security definer 함수로만 한 건씩 꺼낸다.
create or replace function public.get_shared_analysis(p_slug text)
returns table (
  slug text, team_name text, goal text, purpose text, members jsonb, result jsonb, narrative jsonb, created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.slug, t.team_name, t.goal, t.purpose, t.members, t.result, t.narrative, t.created_at
  from public.team_analyses t
  where t.slug = p_slug
    and t.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_shared_analysis(text) from public;
grant execute on function public.get_shared_analysis(text) to anon, authenticated;


-- ── 3. 만료 데이터 정리 ─────────────────────────────────────────
-- 실명이 담긴 데이터를 방치하지 않는다.
create or replace function public.purge_expired()
returns void language sql security definer set search_path = public as $$
  delete from public.team_analyses where expires_at < now();
  delete from public.narrative_cache where created_at < now() - interval '14 days';
$$;

-- pg_cron 확장을 켠 뒤 매일 새벽 4시 실행 (선택)
-- select cron.schedule('purge-expired', '0 4 * * *', 'select public.purge_expired()');
