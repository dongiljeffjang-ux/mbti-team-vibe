import { createClient } from "@supabase/supabase-js";

/* anon 키는 브라우저에 노출되는 것이 정상이다.
   실제 접근 제어는 Supabase RLS 정책이 담당한다 (supabase/schema.sql 참고).
   서비스 롤 키는 절대 여기에 두지 않는다 — api/narrative.js에서만 쓴다. */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** Supabase 환경변수가 없으면 공유 기능만 조용히 비활성화된다. 분석은 그대로 동작한다. */
export const shareEnabled = Boolean(supabase);

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 헷갈리는 l, o, 0, 1 제외

export function makeSlug(len = 10) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function saveShare({ slug, teamName, goal, purpose, members, result, narrative }) {
  if (!supabase) return false;
  const { error } = await supabase.from("team_analyses").insert({ slug, team_name: teamName, goal, purpose, members, result, narrative });
  if (error) {
    console.error("공유 저장 실패", error);
    return false;
  }
  return true;
}

export async function loadShare(slug) {
  if (!supabase) return null;
  // 직접 select이 아니라 RPC를 쓴다. 테이블 전체 조회를 막고 slug를 아는 사람만 통과시킨다.
  const { data, error } = await supabase.rpc("get_shared_analysis", { p_slug: slug });
  if (error) {
    console.error("공유 조회 실패", error);
    return null;
  }
  return Array.isArray(data) ? data[0] || null : data;
}
