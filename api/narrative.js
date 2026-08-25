import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { analyze, ALL_TYPES, TYPE_META, AXIS_LIST } from "../lib/rules.js";
import { calculateFourPillars } from "manseryeok";

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

const STEM_ELEMENTS = { 갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수" };
const BRANCH_ELEMENTS = { 자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화", 오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수" };
function buildSajuProfile(m) {
  if (!m.birthDate || !m.birthTime) return null;
  const d = m.birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/), t = m.birthTime.match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  const calc = calculateFourPillars({ year: +d[1], month: +d[2], day: +d[3], hour: +t[1], minute: +t[2], isLunar: m.birthCalendar === "lunar", gender: ["male", "female"].includes(m.gender) ? m.gender : undefined });
  const pillars = calc.toObject(), counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  Object.values(pillars).forEach((p) => [...p].forEach((c, i) => { const e = i === 0 ? STEM_ELEMENTS[c] : BRANCH_ELEMENTS[c]; if (e) counts[e] += 1; }));
  const max = Math.max(...Object.values(counts));
  return { pillars, hanja: calc.toHanjaString(), dayMaster: calc.dayElement?.stem, dayMasterYinYang: calc.dayYinYang?.stem, elementCounts: counts, dominantElements: Object.keys(counts).filter((e) => counts[e] === max), tenGods: calc.tenGods };
}

function buildContext(members, goal, purpose, teamName, r) {
  return {
    팀이름: teamName,
    팀목표: goal,
    팀상황과목적: purpose,
    팀원: members.map((m) => ({ 이름: m.name, MBTI: m.type, 역할: m.role, 업무스타일: m.note, 별칭: TYPE_META[m.type].nick, 사주참고: m.saju })),
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "반드시 유효한 JSON 객체만 출력하세요. 마크다운 코드펜스를 사용하지 마세요." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
  return parsed;
}

const strengthsPrompt = (ctx) => `너는 조직 협업 코치다. 아래 팀의 목적과 상황에 맞춰 MBTI 협업 경향을 적용해라. 숫자는 절대 다시 계산하거나 바꾸지 말고 해석만 해라.

${JSON.stringify(ctx, null, 2)}

${STYLE} 사주참고가 있으면 일간·오행 분포·십신을 근거로 "화(火)가 상대적으로 강한 편"처럼 전문적으로 표현하되, 표면 오행 분포에 기반한 참고 해석임을 밝혀라. 각 팀원마다 MBTI와 사주를 함께 엮어, 두 참고 체계가 역할·팀 목표에서 어떤 협업 경향으로 나타날 수 있는지 별도 문장으로 설명해라. MBTI나 사주가 성격·성과를 결정한다고 말하지 마라.

JSON만 출력. 마크다운·설명 금지.
{"summary":"팀 목표를 고려한 전체 협업 전망 2~3문장","strengths":[{"title":"6자 이내 제목","detail":"팀 목표에 어떻게 기여하는지 포함한 2문장"},{"title":"","detail":""},{"title":"","detail":""}],"memberInsights":[{"name":"팀원 이름","contribution":"현재 역할과 강점을 팀 목표에 연결한 2문장","watchout":"이 팀에서 협업할 때 주의할 점 1문장"}],"pairTip":"최고궁합 두 사람을 이 팀의 어떤 업무에 붙이면 좋은지 1문장","sajuSummary":"입력된 팀원의 일간·오행 분포를 팀 협업 관점에서 2~3문장으로 해석","sajuInsights":[{"name":"팀원 이름","dayMaster":"예: 계수(癸水)·음","elementSummary":"오행 분포 수치와 화(火) 등 상대적으로 강한 기운을 근거로 한 1~2문장","collaboration":"팀 목적과 역할에 적용한 협업 참고 1문장","mbtiSajuProfile":"이 팀원의 MBTI 협업 경향과 사주 참고 성향을 함께 엮은 개인별 설명 2~3문장"}]}`;

const conflictsPrompt = (ctx) => `너는 조직 협업 코치다. 아래 팀의 목표, 현재 상황, 각 팀원의 MBTI 협업 경향, 역할과 업무 스타일을 종합해 실제로 생길 수 있는 잠재 갈등 시나리오를 새로 작성해라.

코드가 감지한 갈등 신호는 참고 자료일 뿐이다. 제목이나 문장을 그대로 복사하지 말고, 누가 어떤 업무 장면에서 왜 부딪힐 수 있는지 팀 맥락에 맞춰 구체화해라. MBTI만으로 사람을 단정하지 말고 가능성으로 표현해라. 갈등이 거의 없다면 억지로 만들지 말고 협업 리스크 1~2개만 제시해라.

${JSON.stringify(ctx, null, 2)}

${STYLE}

JSON만 출력. 마크다운·설명 금지.
{"conflicts":[{"title":"팀 상황에 맞는 갈등 제목","people":"관련 팀원 이름 또는 역할","scenario":"갈등이 나타날 수 있는 실제 업무 장면 1~2문장","why":"MBTI 경향·직무·개인 서술을 연결한 이유 1~2문장","advice":"팀 목표 달성을 위해 이번 주 실행할 해결책 1~2문장"}],"scenarios":{"conflict":{"title":"갈등이 가장 커질 수 있는 순간","when":"갈등이 불거질 업무 조건","case":"실제 팀에서 벌어질 법한 사례 2~3문장","reading":"각 팀원이 다르게 반응하는 이유 1~2문장","move":"팀 목표를 지키기 위한 대응 행동 1~2문장"},"synergy":{"title":"시너지가 가장 크게 나는 순간","when":"팀 강점이 동시에 작동하는 업무 조건","case":"실제 팀에서 벌어질 법한 성공 사례 2~3문장","reading":"각 팀원의 강점이 어떻게 연결되는지 1~2문장","move":"이 시너지를 재현하기 위한 운영 방법 1~2문장"}},"tips":["팀 목표에 맞는 협업 규칙 1문장","협업 규칙 1문장","협업 규칙 1문장"]}`;

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
    if ((m.birthDate || m.birthTime) && (!/^\d{4}-\d{2}-\d{2}$/.test(m.birthDate || "") || !/^\d{2}:\d{2}$/.test(m.birthTime || ""))) return "사주 분석에는 생년월일과 생시를 모두 입력해 주세요.";
    if (m.birthCalendar && !["solar", "lunar"].includes(m.birthCalendar)) return "달력 유형이 올바르지 않습니다.";
    if (m.gender && !["unknown", "male", "female"].includes(m.gender)) return "성별 값이 올바르지 않습니다.";
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

  const members = body.members.map((m, i) => ({ id: i, name: m.name?.trim() || `팀원 ${i + 1}`, type: m.type, role: m.role?.trim() || "미정", note: m.note?.trim() || "", birthDate: m.birthDate || "", birthTime: m.birthTime || "", birthCalendar: m.birthCalendar || "solar", gender: m.gender || "unknown" }));
  members.forEach((m) => { m.saju = buildSajuProfile(m); });
  const goal = body.goal.trim();
  const purpose = body.purpose.trim();
  const teamName = body.teamName.trim();

  // 클라이언트가 보낸 숫자는 쓰지 않는다. 서버에서 다시 계산한다.
  const r = analyze(members);
  const ctx = buildContext(members, goal, purpose, teamName, r);

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ v: 7, model: MODEL, teamName, goal, purpose, members: members.map((m) => [m.name, m.type, m.role, m.note, m.birthDate, m.birthTime, m.birthCalendar, m.gender]) }))
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
    if (!strengths.summary || !Array.isArray(strengths.strengths)) throw new Error("강점 응답 형식이 올바르지 않습니다.");
    if (!Array.isArray(conflicts.conflicts) || !Array.isArray(conflicts.tips) || !conflicts.scenarios?.conflict || !conflicts.scenarios?.synergy) throw new Error("갈등 응답 형식이 올바르지 않습니다.");
    strengths.memberInsights = Array.isArray(strengths.memberInsights) ? strengths.memberInsights : [];
    strengths.sajuSummary = strengths.sajuSummary || "입력된 생년월일·생시가 없어 사주 참고 해석을 제공하지 않습니다.";
    strengths.sajuInsights = Array.isArray(strengths.sajuInsights) ? strengths.sajuInsights : [];
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

