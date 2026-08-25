/* ═══════════════════════════════════════════════════════════════
   rules.js — MBTI 규칙표 + 결정론적 계산
   클라이언트(src/App.jsx)와 서버(api/narrative.js)가 함께 쓴다.
   LLM은 이 결과를 해석만 하고, 숫자는 전부 여기서 나온다.
   ═══════════════════════════════════════════════════════════════ */

export const GROUPS = [
  { key: "NT", label: "분석가", types: ["INTJ", "INTP", "ENTP", "ENTJ"] },
  { key: "NF", label: "외교관", types: ["INFJ", "INFP", "ENFP", "ENFJ"] },
  { key: "SJ", label: "관리자", types: ["ISTJ", "ISFJ", "ESFJ", "ESTJ"] },
  { key: "SP", label: "탐험가", types: ["ISTP", "ISFP", "ESFP", "ESTP"] },
];

export const ALL_TYPES = GROUPS.flatMap((g) => g.types);

export const TYPE_META = {
  INTJ: { nick: "전략 설계자", keys: ["장기 시야", "구조화", "독립"] },
  INTP: { nick: "논리 탐구자", keys: ["원리 탐색", "가설", "유연"] },
  ENTP: { nick: "논쟁형 혁신가", keys: ["발상 전환", "토론", "실험"] },
  ENTJ: { nick: "판을 짜는 지휘자", keys: ["목표 설정", "결단", "추진"] },
  INFJ: { nick: "통찰하는 조언자", keys: ["의미 부여", "통찰", "신념"] },
  INFP: { nick: "가치 중심 이상가", keys: ["가치", "공감", "표현"] },
  ENFP: { nick: "아이디어 발화기", keys: ["발산", "연결", "열정"] },
  ENFJ: { nick: "사람 중심 리더", keys: ["동기 부여", "조율", "설득"] },
  ISTJ: { nick: "원칙과 기록의 관리자", keys: ["책임", "정확성", "일관성"] },
  ISFJ: { nick: "조용한 헌신형 서포터", keys: ["세심함", "지원", "성실"] },
  ESFJ: { nick: "팀 케어 조율가", keys: ["배려", "협업", "실무"] },
  ESTJ: { nick: "목표 지향 추진자", keys: ["체계", "관리", "실행"] },
  ISTP: { nick: "문제 해결 기술자", keys: ["즉시 대응", "손기술", "냉정"] },
  ISFP: { nick: "감각적 실행가", keys: ["감각", "온화함", "현재"] },
  ESFP: { nick: "분위기 메이커", keys: ["활력", "현장감", "친화"] },
  ESTP: { nick: "즉흥 돌파형 실행가", keys: ["속도", "돌파", "협상"] },
};

/* 4축 배합 규칙표: 글자 → 축 가중치 */
export const AXIS_RULES = {
  창의: { N: 3, P: 2, E: 1, F: 0.5 },
  실행: { S: 2, J: 3, E: 1, T: 1 },
  조율: { F: 3, E: 2, J: 1, S: 0.5 },
  분석: { T: 3, I: 2, N: 1, J: 0.5 },
};

export const AXIS_LIST = ["창의", "실행", "조율", "분석"];
export const AXIS_VAR = { 창의: "--creative", 실행: "--exec", 조율: "--harmony", 분석: "--analysis" };
export const AXIS_ROLE = {
  창의: "아이디어 발화 담당",
  실행: "실행 드라이버",
  조율: "팀 분위기 조율자",
  분석: "구조·검증 담당",
};

export const MBTI_SLIDER_AXES = [
  { key: "ei", left: "I", right: "E", label: "에너지 방향" },
  { key: "sn", left: "S", right: "N", label: "정보 인식" },
  { key: "tf", left: "T", right: "F", label: "판단 기준" },
  { key: "jp", left: "J", right: "P", label: "업무 방식" },
];

export function axesFromType(type) {
  return { ei: type[0] === "E" ? 100 : 0, sn: type[1] === "N" ? 100 : 0, tf: type[2] === "F" ? 100 : 0, jp: type[3] === "P" ? 100 : 0 };
}

export function typeFromAxes(axes = {}) {
  return [
    Number(axes.ei) >= 50 ? "E" : "I",
    Number(axes.sn) >= 50 ? "N" : "S",
    Number(axes.tf) >= 50 ? "F" : "T",
    Number(axes.jp) >= 50 ? "P" : "J",
  ].join("");
}

/* 1:1 궁합 규칙표: 차원별 일치/불일치 점수 + 해석 문구 */
export const PAIR_RULES = {
  EI: { same: 7, diff: 10, sameNote: "에너지 리듬이 비슷해 편하게 붙어 있을 수 있어요", diffNote: "발산과 정리가 번갈아 일어나 대화가 굴러가요" },
  SN: { same: 12, diff: 6, sameNote: "정보를 같은 언어로 주고받아 설명이 짧아요", diffNote: "구체와 큰 그림 사이에 번역이 필요해요" },
  TF: { same: 8, diff: 10, sameNote: "판단 기준이 비슷해 결정이 빨라요", diffNote: "논리와 감정 양쪽을 챙기는 결정이 나와요" },
  JP: { same: 10, diff: 6, sameNote: "일하는 속도와 마감 감각이 맞아요", diffNote: "계획과 즉흥 사이 리듬 조율이 필요해요" },
};
export const RAW_MIN = 7 + 6 + 8 + 6;
export const RAW_MAX = 10 + 12 + 10 + 10;

/* 상위 인지기능 2개 (공유 시 가산점) */
export const TOP_FN = {
  ISTJ: ["Si", "Te"], ISFJ: ["Si", "Fe"], INFJ: ["Ni", "Fe"], INTJ: ["Ni", "Te"],
  ISTP: ["Ti", "Se"], ISFP: ["Fi", "Se"], INFP: ["Fi", "Ne"], INTP: ["Ti", "Ne"],
  ESTP: ["Se", "Ti"], ESFP: ["Se", "Fi"], ENFP: ["Ne", "Fi"], ENTP: ["Ne", "Ti"],
  ESTJ: ["Te", "Si"], ESFJ: ["Fe", "Si"], ENFJ: ["Fe", "Ni"], ENTJ: ["Te", "Ni"],
};

/* 팀 유형 분류표: 1순위축-2순위축 */
export const TEAM_TYPES = {
  "창의-분석": { name: "아이디어 실험실형", desc: "가설을 세우고 뜯어보는 걸 즐기는 팀. 결론은 좋지만 착수가 늦습니다." },
  "창의-실행": { name: "프로토타입 질주형", desc: "떠오르면 일단 만들어보는 팀. 만들다 만 것이 쌓이기 쉽습니다." },
  "창의-조율": { name: "브레인스토밍 살롱형", desc: "말이 잘 통하고 발상이 풍부한 팀. 결정을 미루는 경향이 있습니다." },
  "실행-분석": { name: "정밀 실행 엔진형", desc: "정한 걸 정확히 끝내는 팀. 방향 자체를 의심하는 목소리가 적습니다." },
  "실행-창의": { name: "속도전 스타트업형", desc: "빠르게 치고 나가는 팀. 기록과 검증이 뒤로 밀립니다." },
  "실행-조율": { name: "든든한 운영 크루형", desc: "일상 협업이 매끄러운 팀. 판을 흔드는 제안이 잘 안 나옵니다." },
  "조율-창의": { name: "따뜻한 창작 공방형", desc: "심리적 안전감이 높은 팀. 냉정한 피드백이 부족할 수 있습니다." },
  "조율-실행": { name: "팀워크 우선 서포트형", desc: "서로 챙기며 굴러가는 팀. 갈등을 덮고 넘어가기 쉽습니다." },
  "조율-분석": { name: "신중한 합의 도출형", desc: "충분히 듣고 결정하는 팀. 속도가 아쉬울 수 있습니다." },
  "분석-창의": { name: "전략 설계 연구소형", desc: "구조와 논리가 강한 팀. 실무 착수와 감정 케어가 약합니다." },
  "분석-실행": { name: "데이터 기반 추진형", desc: "근거를 만들고 밀어붙이는 팀. 분위기가 건조해지기 쉽습니다." },
  "분석-조율": { name: "논리적 중재자형", desc: "이견을 정리해 합의로 만드는 팀. 모험적 시도가 적습니다." },
};

/* 팀빌딩 활동 추천표 */
export const ACTIVITIES = {
  창의: ["제약 조건 하나 걸고 30분 아이디어 스프린트", "타 업계 사례 훔쳐오기 워크숍", "낯선 동네 산책하며 잡담 회의"],
  실행: ["반나절 해커톤 — 끝까지 굴러가는 것 하나 만들기", "방탈출 / 미션 클리어형 액티비티", "분기 목표 보드 같이 짜기"],
  조율: ["돌아가며 서로 강점 말해주기 세션", "팀 저녁 + 회고 한 바퀴", "1:1 랜덤 커피챗 로테이션"],
  분석: ["보드게임 전략전 (아그리콜라·테라포밍류)", "실패 사례 부검 회고", "각자 관심 주제 10분 세미나"],
};

/* ═══════════════════════════════════════════════════════════════
   PURE CALC  —  전부 코드
   ═══════════════════════════════════════════════════════════════ */

export function axisScores(type) {
  const raw = {};
  for (const axis of AXIS_LIST) {
    let s = 0;
    for (const l of type) s += AXIS_RULES[axis][l] || 0;
    raw[axis] = s;
  }
  const tot = AXIS_LIST.reduce((a, k) => a + raw[k], 0) || 1;
  const out = {};
  for (const axis of AXIS_LIST) out[axis] = (raw[axis] / tot) * 100;
  return out;
}

export function pairScore(a, b) {
  const dims = [["EI", 0], ["SN", 1], ["TF", 2], ["JP", 3]];
  let raw = 0;
  const notes = [];
  for (const [key, i] of dims) {
    const same = a[i] === b[i];
    raw += same ? PAIR_RULES[key].same : PAIR_RULES[key].diff;
    notes.push({ dim: key, same, note: same ? PAIR_RULES[key].sameNote : PAIR_RULES[key].diffNote });
  }
  let score = 45 + ((raw - RAW_MIN) / (RAW_MAX - RAW_MIN)) * 48;
  const shared = TOP_FN[a].filter((f) => TOP_FN[b].includes(f)).length;
  score += shared * 3;
  return { score: Math.max(40, Math.min(96, Math.round(score))), notes, shared };
}

export function grade(s) {
  if (s >= 85) return { label: "최상", tone: "hi" };
  if (s >= 72) return { label: "좋음", tone: "good" };
  if (s >= 58) return { label: "보통", tone: "mid" };
  if (s >= 46) return { label: "노력 필요", tone: "low" };
  return { label: "주의", tone: "warn" };
}

export function dimRatios(types) {
  const n = types.length || 1;
  const c = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  types.forEach((t) => t.split("").forEach((l) => (c[l] += 1)));
  const r = {};
  Object.keys(c).forEach((k) => (r[k] = c[k] / n));
  return { counts: c, ratio: r };
}

export function balanceScore(ratio) {
  const pairs = [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]];
  const vals = pairs.map(([a]) => 1 - Math.abs(ratio[a] - 0.5) * 2);
  return (vals.reduce((x, y) => x + y, 0) / 4) * 100;
}

export function teamCode(ratio) {
  const pairs = [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]];
  return pairs
    .map(([a, b]) => {
      const win = ratio[a] >= ratio[b] ? a : b;
      const share = Math.max(ratio[a], ratio[b]);
      return share >= 0.7 ? win : win.toLowerCase();
    })
    .join("");
}

export function teamAxisMix(types) {
  const acc = { 창의: 0, 실행: 0, 조율: 0, 분석: 0 };
  types.forEach((t) => {
    const a = axisScores(t);
    AXIS_LIST.forEach((k) => (acc[k] += a[k]));
  });
  const tot = AXIS_LIST.reduce((a, k) => a + acc[k], 0) || 1;
  const out = {};
  AXIS_LIST.forEach((k) => (out[k] = (acc[k] / tot) * 100));
  return out;
}

export function detectConflicts(ratio, types, pairs, mix) {
  const out = [];
  const push = (title, why, fix) => out.push({ title, why, fix });

  if (ratio.T >= 0.8) push("논리 과잉, 감정 케어 공백", `T 성향이 ${Math.round(ratio.T * 100)}%입니다. 피드백이 사실만 남고 사람은 빠집니다.`, "리뷰 시작 전 30초 '잘된 점' 라운드를 고정 절차로 넣으세요.");
  if (ratio.F >= 0.8) push("갈등 회피로 인한 결정 지연", `F 성향이 ${Math.round(ratio.F * 100)}%입니다. 반대 의견이 부드럽게 흐려집니다.`, "회의마다 반대 역할(데블스 애드버킷)을 돌아가며 지정하세요.");
  if (ratio.T > 0.38 && ratio.T < 0.62 && types.length >= 4) push("판단 기준 충돌", "T와 F가 팽팽해 '무엇이 맞는가'와 '누가 힘든가'가 매번 부딪힙니다.", "결정 전에 판단 기준(비용·속도·팀 부담)의 우선순위를 먼저 합의하세요.");
  if (ratio.J >= 0.85) push("계획 경직", `J 성향이 ${Math.round(ratio.J * 100)}%입니다. 중간에 방향을 틀어야 할 때 저항이 큽니다.`, "스프린트마다 '계획 변경 가능 구간'을 명시적으로 열어두세요.");
  if (ratio.P >= 0.85) push("마감 리스크", `P 성향이 ${Math.round(ratio.P * 100)}%입니다. 마감이 실제 마감으로 작동하지 않습니다.`, "최종 마감 대신 중간 산출물 마감을 2~3개로 쪼개세요.");
  if (ratio.J > 0.35 && ratio.J < 0.65) push("업무 리듬 불일치", "계획형과 즉흥형이 섞여 있어 '언제까지'의 의미가 서로 다릅니다.", "마감을 '초안 마감'과 '확정 마감'으로 나눠 부르세요.");
  if (ratio.N >= 0.8) push("디테일 실종", `N 성향이 ${Math.round(ratio.N * 100)}%입니다. 그림은 크고 실행 목록은 비어 있습니다.`, "회의 마지막 5분을 '누가·언제·무엇을'로만 채우세요.");
  if (ratio.S >= 0.8) push("혁신 정체", `S 성향이 ${Math.round(ratio.S * 100)}%입니다. 검증된 방식 밖으로 잘 나가지 않습니다.`, "분기마다 '지금 방식이 틀렸다면?' 세션을 한 번 넣으세요.");
  if (ratio.E >= 0.8) push("발언 과잉, 기록 부족", `E 성향이 ${Math.round(ratio.E * 100)}%입니다. 말은 많은데 남는 게 적습니다.`, "서기 역할을 고정하고 회의 후 3줄 요약을 공유하세요.");
  if (ratio.I >= 0.8) push("침묵 회의", `I 성향이 ${Math.round(ratio.I * 100)}%입니다. 의견이 회의장 밖에서만 오갑니다.`, "안건을 하루 전 공유하고 문서에 먼저 코멘트를 받으세요.");

  const dup = {};
  types.forEach((t) => (dup[t] = (dup[t] || 0) + 1));
  Object.entries(dup).forEach(([t, n]) => {
    if (n >= 3) push(`${t} 과밀 (${n}명)`, "같은 유형이 몰리면 같은 사각지대를 공유합니다.", "이 유형이 약한 영역(반대 성향 축)을 체크리스트로 강제하세요.");
  });

  const bad = pairs.filter((p) => p.score < 50);
  if (bad.length) {
    const w = bad[0];
    push(`${w.a.name} ↔ ${w.b.name} 마찰 주의`, `궁합 점수 ${w.score}점. 정보 처리 방식과 리듬이 모두 어긋납니다.`, "둘 사이에 중재 성향 멤버를 끼워 넣거나, 협업 접점을 문서 기반으로 바꾸세요.");
  }

  const weakest = AXIS_LIST.reduce((a, b) => (mix[a] < mix[b] ? a : b));
  if (mix[weakest] < 12) push(`${weakest} 역량 공백`, `팀 배합에서 ${weakest}가 ${Math.round(mix[weakest])}%뿐입니다.`, `${weakest} 담당을 지정하거나 외부 리뷰어를 붙이세요.`);

  return out.slice(0, 5);
}

export function analyze(members) {
  const types = members.map((m) => m.type);
  const { ratio, counts } = dimRatios(types);
  const pairs = [];
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const r = pairScore(members[i].type, members[j].type);
      pairs.push({ a: members[i], b: members[j], ...r, grade: grade(r.score) });
    }
  const avgPair = pairs.length ? pairs.reduce((s, p) => s + p.score, 0) / pairs.length : 0;
  const bal = balanceScore(ratio);
  const chemistry = Math.round(avgPair * 0.6 + bal * 0.4);
  const mix = teamAxisMix(types);
  const sorted = [...AXIS_LIST].sort((a, b) => mix[b] - mix[a]);
  const tKey = `${sorted[0]}-${sorted[1]}`;
  const teamType = TEAM_TYPES[tKey] || { name: "혼합형", desc: "뚜렷한 우세 축이 없는 균형 팀입니다." };

  const stages = [
    { stage: "아이디어 발산", axis: "창의", need: Math.max(1, Math.ceil(members.length * 0.4)) },
    { stage: "구조화·검증", axis: "분석", need: Math.max(1, Math.ceil(members.length * 0.3)) },
    { stage: "의사결정·조율", axis: "조율", need: Math.max(1, Math.ceil(members.length * 0.25)) },
    { stage: "실행·마감", axis: "실행", need: Math.max(1, Math.ceil(members.length * 0.4)) },
  ].map((s) => ({
    ...s,
    picks: [...members].sort((x, y) => axisScores(y.type)[s.axis] - axisScores(x.type)[s.axis]).slice(0, s.need),
  }));

  /* 보완도 = 합류 후 성향 균형(40%) + 기존 멤버와의 평균 궁합(30%) + 팀 최약축 보강력(30%) */
  const weakAxis = sorted[3];
  const complements = ALL_TYPES.map((t) => {
    const nb = balanceScore(dimRatios([...types, t]).ratio);
    const avgWith = members.reduce((s, m) => s + pairScore(m.type, t).score, 0) / members.length;
    const weakFit = Math.min(100, (axisScores(t)[weakAxis] / 45) * 100);
    return {
      type: t,
      fit: Math.round(nb * 0.4 + avgWith * 0.3 + weakFit * 0.3),
      delta: analyzeCore([...types, t]).chemistry - chemistry,
    };
  })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3);

  const conflicts = detectConflicts(ratio, types, pairs, mix);
  const bestPair = pairs.length ? pairs.reduce((a, b) => (a.score >= b.score ? a : b)) : null;
  const worstPair = pairs.length ? pairs.reduce((a, b) => (a.score <= b.score ? a : b)) : null;

  const actList = [...ACTIVITIES[sorted[0]].slice(0, 2), ACTIVITIES[sorted[3]][0]];
  const activities = ratio.I >= 0.6 ? actList.map((a) => a) : actList;

  return { ratio, counts, pairs, avgPair, balance: bal, chemistry, mix, sorted, weakAxis, teamType, code: teamCode(ratio), stages, complements, conflicts, bestPair, worstPair, activities, introverted: ratio.I >= 0.6 };
}

/* 시뮬레이션용 경량 계산 (점수만) */
export function analyzeCore(types) {
  const { ratio } = dimRatios(types);
  let sum = 0, n = 0;
  for (let i = 0; i < types.length; i++)
    for (let j = i + 1; j < types.length; j++) { sum += pairScore(types[i], types[j]).score; n++; }
  const avg = n ? sum / n : 0;
  return { chemistry: Math.round(avg * 0.6 + balanceScore(ratio) * 0.4) };
}

