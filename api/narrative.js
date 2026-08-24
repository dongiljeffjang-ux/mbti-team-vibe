import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { analyze, ALL_TYPES, TYPE_META, AXIS_LIST } from "../lib/rules.js";

/* ───────────────────────────────────────────────────────────────
   /api/narrative
   - OpenAI API 키를 서버에만 두고 클라이언트에서 감춘다
   - 팀 구성이 같으면 Supabase 캐시를 재사용해 호출 비용을 줄인다
   - 점수·비중은 클라이언트를 믿지 않고 rules.js로 서버에서 다시 계산한다
   ─────────────────────────────────────────────────────────────── */

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const CACHE_TTL_DAYS = 14;

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const STYLE = `한국어 해요체. 각 문장 60자 이내. 과장·점술식 표현 금지. MBTI를 단정적 성격 규정이 아니라 "협업 경향"으로 서술. 팀 목표에 맞춘 실무적 조언.`;

function buildContext(members, goal, purpose, teamName, r) {
  return {
    팀이름: teamName,
    팀목표: goal,
    팀상황과목적: purpose,
    팀원: members.map((m) => ({ 이름: m.name, MBTI: m.type, 역할: m.role, 업무스타일: m.note, 별칭: TYPE_META[m.type].nick })),
    팀코드: r.code,
    팀유형: r.teamType.name,
    케미점수: r.chemistry,
    성향비중: Object.fromEntries(
      ["E", "I", "S", "N", "T", "F", "J", "P"].map((k) => [k, Math.round(r.ratio[k] * 100) + "%"])
    ),
    배합비: Object.fromEntries(AXIS_LIST.map((k) => [k, Math.round(r.mix[k]) + "%"])),
    최고궁합: r.bestPair ? `${r.bestPair.a.name}(${r.bestPair.a.type}) ↔ ${r.bestPair.b.name}(${r.bestPair.b.type}) ${r.bestPair.score}점` : "-",
    최저궁합: r.worstPair ? `${r.worstPair.a.name}(${r.worstPair.a.type}) ↔ ${r.worstPair.b.name}(${r.worstPair.b.type}) ${r.worstPair.score}점` : "-",
    감지된갈등신호: r.conflicts.map((c) => c.title),
  };
}

async function ask(prompt) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      max_output_tokens: 1200,
      store: false,
      text: { format: { type: "json_object" } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data.output_text || "{}");
  if (!parsed.summary || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.memberInsights)) {
    throw new Error("OpenAI 응답 형식이 올바르지 않습니다.");
  }
  return parsed;
}

const strengthsPrompt = (ctx) => `너는 조직 협업 코치다. 아래 팀의 목적과 상황에 맞춰 MBTI 협업 경향을 적용해라. 숫자는 절대 다시 계산하거나 바꾸지 말고 해석만 해라.

${JSON.stringify(ctx, null, 2)}

${STYLE}

JSON만 출력. 마크다운·설명 금지.
{"summary":"팀 목표를 고려한 전체 협업 전망 2~3문장","strengths":[{"title":"6자 이내 제목","detail":"팀 목표에 어떻게 기여하는지 포함한 2문장"},{"title":"","detail":""},{"title":"","detail":""}],"memberInsights":[{"name":"팀원 이름","contribution":"현재 역할과 강점을 팀 목표에 연결한 2문장","watchout":"이 팀에서 협업할 때 주의할 점 1문장"}],"pairTip":"최고궁합 두 사람을 이 팀의 어떤 업무에 붙이면 좋은지 1문장"}`;

const conflictsPrompt = (ctx) => `너는 조직 협업 코치다. 아래 팀 분석 결과에서 감지된 갈등 신호를 팀의 실제 목적과 상황에 맞는 실무 조언으로 풀어라. 숫자는 바꾸지 마라.

${JSON.stringify(ctx, null, 2)}

${STYLE}

JSON만 출력. 마크다운·설명 금지.
{"conflicts":[{"title":"감지된갈등신호 중 하나 그대로","advice":"당장 이번 주에 실행 가능한 해결책 1~2문장"}],"tips":["협업 팁 1문장","협업 팁 1문장","협업 팁 1문장"]}`;

function validate(body) {
  const { teamName, goal, purpose, members } = body || {};
  if (typeof teamName !== "string" || !teamName.trim() || teamName.length > 80) return "팀 이름이 올바르지 않습니다.";
  if (typeof goal !== "string" || !goal.trim() || goal.length > 80) return "팀 목표가 올바르지 않습니다.";
  if (typeof purpose !== "string" || purpose.trim().length < 20 || purpose.length > 1200) return "팀 목적과 상황을 20자 이상 1200자 이하로 입력해 주세요.";
  if (!Array.isArray(members) || members.length < 2 || members.length > 10) return "팀원은 2명 이상 10명 이하여야 합니다.";
  for (const m of members) {
    if (!ALL_TYPES.includes(m?.type)) return `알 수 없는 MBTI 유형: ${m?.type}`;
    if (typeof m.name !== "string" || m.name.length > 20) return "이름은 20자 이내여야 합니다.";
    if (typeof m.role !== "string" || m.role.length > 60) return "역할은 60자 이내여야 합니다.";
    if (typeof m.note !== "string" || m.note.length > 300) return "업무 스타일은 300자 이내여야 합니다.";
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 지원합니다." });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const bad = validate(body);
  if (bad) return res.status(400).json({ error: bad });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY 환경변수가 없습니다." });
  }

  const members = body.members.map((m, i) => ({ id: i, name: m.name?.trim() || `팀원 ${i + 1}`, type: m.type, role: m.role?.trim() || "미정", note: m.note?.trim() || "" }));
  const goal = body.goal.trim();
  const purpose = body.purpose.trim();
  const teamName = body.teamName.trim();

  // 클라이언트가 보낸 숫자는 쓰지 않는다. 서버에서 다시 계산한다.
  const r = analyze(members);
  const ctx = buildContext(members, goal, purpose, teamName, r);

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ v: 2, model: MODEL, teamName, goal, purpose, members: members.map((m) => [m.name, m.type, m.role, m.note]) }))
    .digest("hex");

  if (admin) {
    const { data } = await admin
      .from("narrative_cache")
      .select("payload, created_at")
      .eq("cache_key", cacheKey)
      .gt("created_at", new Date(Date.now() - CACHE_TTL_DAYS * 864e5).toISOString())
      .maybeSingle();
    if (data?.payload) {
      return res.status(200).json({ ...data.payload, checksum: r.chemistry, cached: true });
    }
  }

  try {
    const [strengths, conflicts] = await Promise.all([ask(strengthsPrompt(ctx)), ask(conflictsPrompt(ctx))]);
    const payload = { strengths, conflicts };

    if (admin) {
      await admin
        .from("narrative_cache")
        .upsert({ cache_key: cacheKey, payload, model: MODEL, created_at: new Date().toISOString() });
    }

    return res.status(200).json({ ...payload, checksum: r.chemistry, cached: false });
  } catch (e) {
    console.error("narrative 생성 실패", e);
    return res.status(502).json({ error: "해설 생성에 실패했습니다.", detail: String(e.message).slice(0, 200) });
  }
}
