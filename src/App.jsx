import React, { useState, useMemo, useCallback, useEffect } from "react";
import { analyze, analyzeCore, axisScores, dimRatios, TYPE_META, GROUPS, AXIS_LIST, AXIS_VAR, AXIS_ROLE } from "../lib/rules.js";
import { shareEnabled, makeSlug, saveShare, loadShare } from "./lib/supabase.js";
import "./styles.css";

const GOALS = ["신규 프로젝트 착수", "일상 협업 개선", "아이디어 회의 활성화", "팀 빌딩 / 상견례", "성과 부진 회복"];
const TODAY = new Date().toISOString().slice(0, 10);
const INDUSTRIES = ["제조업", "IT·소프트웨어", "금융·보험", "유통·커머스", "건설·엔지니어링", "바이오·헬스케어", "공공·교육", "콘텐츠·미디어", "전문 서비스", "기타"];
const COMPANY_CULTURES = ["성과·경쟁 중심", "안정·규정 준수 중심", "혁신·실험 중심", "고객 중심", "사람·성장 중심", "협업·합의 중심", "잘 모르겠음"];
const LEADERSHIP_STYLES = ["상명하복·지시형", "목표제시·자율실행형", "합의·참여형", "코칭·성장지원형", "상황대응형", "잘 모르겠음"];

let uid = 100;
const seed = [
  { id: 1, name: "김지훈", type: "ENFP", role: "기획 리드", note: "새로운 아이디어를 빠르게 제안하는 편", birthDate: "", birthTime: "", birthCalendar: "solar", gender: "unknown" },
  { id: 2, name: "이수민", type: "ISTJ", role: "개발", note: "일정과 품질 기준을 꼼꼼히 챙김", birthDate: "", birthTime: "", birthCalendar: "solar", gender: "unknown" },
  { id: 3, name: "박도연", type: "INTJ", role: "데이터 분석", note: "논리적인 근거를 바탕으로 판단", birthDate: "", birthTime: "", birthCalendar: "solar", gender: "unknown" },
  { id: 4, name: "최민재", type: "ESFJ", role: "고객 커뮤니케이션", note: "팀 분위기와 고객 반응을 잘 살핌", birthDate: "", birthTime: "", birthCalendar: "solar", gender: "unknown" },
];

function Tile({ type, index, name, size = "md", onClick, active }) {
  const meta = TYPE_META[type];
  const ax = axisScores(type);
  const top = [...AXIS_LIST].sort((a, b) => ax[b] - ax[a])[0];
  return (
    <button className={`tile tile-${size} ${active ? "tile-on" : ""}`} onClick={onClick} style={{ "--tint": `var(${AXIS_VAR[top]})` }}>
      <span className="tile-idx">{index != null ? String(index).padStart(2, "0") : type.slice(0, 1)}</span>
      <span className="tile-sym">{type}</span>
      <span className="tile-name">{name || meta.nick}</span>
      <span className="tile-fn">{meta.keys.join(" · ")}</span>
    </button>
  );
}

function Bar({ label, value, colorVar, right }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value}%`, background: `var(${colorVar})` }} />
      </div>
      <span className="bar-val">{right ?? `${Math.round(value)}%`}</span>
    </div>
  );
}

export default function App() {
  const [teamName, setTeamName] = useState("");
  const [goal, setGoal] = useState("");
  const [industry, setIndustry] = useState("");
  const [companyCulture, setCompanyCulture] = useState("");
  const [leadership, setLeadership] = useState("");
  const [purpose, setPurpose] = useState("");
  const [members, setMembers] = useState(seed);
  const [picking, setPicking] = useState(null);
  const [result, setResult] = useState(null);
  const [llm, setLlm] = useState({ loading: false, s: null, c: null, error: null });
  const [tab, setTab] = useState("chem");
  const [simType, setSimType] = useState(null);
  const [share, setShare] = useState({ slug: null, saving: false, error: null });
  const [loadedFrom, setLoadedFrom] = useState(null);

  const valid = members.filter((m) => m.type);
  const ready = valid.length >= 2;
  const hasSajuInput = result?.members?.some((m) => m.birthDate && m.birthTime);

  const run = useCallback(async () => {
    const list = valid.map((m, i) => ({ ...m, name: m.name?.trim() || `팀원 ${i + 1}`, role: m.role?.trim() || "미정", note: m.note?.trim() || "" }));
    const r = analyze(list);
    setResult({ ...r, members: list });
    setTab("chem");
    setSimType(null);
    setShare({ slug: null, saving: false, error: null });
    setLoadedFrom(null);
    setLlm({ loading: true, s: null, c: null, error: null });
    try {
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName, goal, purpose, industry, companyCulture, leadership, members: list.map((m) => ({ name: m.name, type: m.type, role: m.role, note: m.note, birthDate: m.birthDate, birthTime: m.birthTime, birthCalendar: m.birthCalendar, gender: m.gender })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(" · ") || `HTTP ${res.status}`);
      // 서버도 같은 rules.js로 계산한다. 어긋나면 배포 버전이 섞인 것.
      if (data.checksum != null && data.checksum !== r.chemistry) {
        console.warn("계산 결과 불일치", { client: r.chemistry, server: data.checksum });
      }
      if (!data.strengths || !Array.isArray(data.strengths.strengths) || !data.conflicts || !Array.isArray(data.conflicts.tips) || !data.conflicts.scenarios) {
        throw new Error("AI 응답 형식이 올바르지 않습니다.");
      }
      setLlm({ loading: false, s: data.strengths, c: data.conflicts, error: null, cached: data.cached });
    } catch (e) {
      setLlm({ loading: false, s: null, c: null, error: `해설 생성 실패 (${e.message}). 아래 계산 결과는 그대로 유효합니다.` });
    }
  }, [members, goal, purpose, teamName, industry, companyCulture, leadership]);

  /* 공유 링크로 들어온 경우 저장된 분석을 복원한다 */
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("share");
    if (!slug || !shareEnabled) return;
    (async () => {
      const row = await loadShare(slug);
      if (!row) return setShare({ slug: null, saving: false, error: "만료되었거나 없는 공유 링크예요." });
      setTeamName(row.team_name || "");
      setGoal(row.goal);
      setIndustry(row.industry || "");
      setCompanyCulture(row.company_culture || "");
      setLeadership(row.leadership || "");
      setPurpose(row.purpose || "");
      setMembers(row.members.map((m, i) => ({ ...m, id: i + 1 })));
      setResult({ ...analyze(row.members.map((m, i) => ({ ...m, id: i + 1 }))), members: row.members.map((m, i) => ({ ...m, id: i + 1 })) });
      setLlm({ loading: false, s: row.narrative?.strengths || null, c: row.narrative?.conflicts || null, error: null });
      setLoadedFrom(new Date(row.created_at).toLocaleDateString("ko-KR"));
      setShare({ slug, saving: false, error: null });
    })();
  }, []);

  const createShare = useCallback(async () => {
    if (!result) return;
    setShare((s) => ({ ...s, saving: true, error: null }));
    const slug = makeSlug();
    const ok = await saveShare({
      slug,
      goal,
      industry,
      companyCulture,
      leadership,
      teamName,
      purpose,
      members: result.members.map((m) => ({ name: m.name, type: m.type, role: m.role, note: m.note })),
      result: { chemistry: result.chemistry, code: result.code, teamType: result.teamType.name },
      narrative: { strengths: llm.s, conflicts: llm.c },
    });
    setShare(ok ? { slug, saving: false, error: null } : { slug: null, saving: false, error: "저장에 실패했어요. Supabase 설정을 확인하세요." });
  }, [result, goal, purpose, teamName, industry, companyCulture, leadership, llm]);

  const sim = useMemo(() => {
    if (!result || !simType) return null;
    const list = [...result.members, { id: "sim", name: "신규", type: simType }];
    const after = analyze(list);
    return { after, delta: after.chemistry - result.chemistry };
  }, [result, simType]);

  const update = (id, patch) => setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const displayedConflicts = llm.c
    ? llm.c.conflicts
    : (result?.conflicts || []).map((c) => ({ title: c.title, scenario: c.why, why: "규칙 기반 참고 신호", advice: c.fix }));

  return (
    <div className="sheet report-shell">
      <aside className="report-sidebar">
        <div className="report-brand">COLLABORATION<br /><b>PROPENSITY ANALYSIS</b></div>
        <div className="report-id">REPORT ID · TEAM VIBE</div>
        <nav className="report-nav">
          {[['chem','01','팀 개요'],['pair','02','케미 지표'],['chem','03','핵심 강점'],['chem','04','잠재 갈등'],['role','05','개인별 기여'],['chem','06','액션 플랜']].map(([key,num,label]) => (
            <button key={num} className={`report-nav-item ${result && tab === key ? 'active' : ''}`} onClick={() => { setTab(key); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span>{num}</span>{label}</button>
          ))}
        </nav>
        <div className="report-sidebar-bottom"><span>ⓘ 분석 기준 및 면책</span><button onClick={run} disabled={!ready || !teamName.trim() || !goal.trim() || !industry || !companyCulture || !leadership || purpose.trim().length < 20 || llm.loading}>분석 종합 완료</button></div>
      </aside>
      <div className="report-content">
      <div className="report-topbar"><span>팀 협업 성향 분석</span><div><button onClick={() => window.print()}>↓ PDF 내보내기</button></div></div>
      <header className="hd">
        <div className="hd-eyebrow">TEAM VIBE / 성분 분석 시트</div>
        <h1 className="hd-title">MBTI 팀 케미 분석기</h1>
        <p className="hd-sub">팀의 목적과 팀원 정보를 입력하면, MBTI 기반 협업 궁합을 실제 업무 맥락에 맞춰 AI가 해석합니다.<br />수치 지표는 참고용으로 계산하고, 최종 조언은 팀의 상황을 반영해 생성합니다.</p>
      </header>

      {/* ── 입력 ── */}
      <section className="panel">
        <div className="panel-hd"><span className="tag">INPUT</span><h2>팀 구성</h2></div>

        <div className="context-fields">
          <div className="context-section-title">01 · 회사 정보 <small>회사 전반의 구조와 문화</small></div>
          <div className="context-select-row"><label className="field-label">업종 <select className="context-input" value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="">업종을 선택하세요</option>{INDUSTRIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="field-label">회사 문화 <select className="context-input" value={companyCulture} onChange={(e) => setCompanyCulture(e.target.value)}><option value="">회사 문화를 선택하세요</option>{COMPANY_CULTURES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="field-label">리더십 방식 <select className="context-input" value={leadership} onChange={(e) => setLeadership(e.target.value)}><option value="">리더십 방식을 선택하세요</option>{LEADERSHIP_STYLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
          <div className="context-section-title">02 · 팀 정보 <small>회사 안에서 분석할 하나의 팀</small></div>
          <label className="field-label">팀 이름 <input className="context-input" value={teamName} placeholder="예: 신규 서비스 TF" onChange={(e) => setTeamName(e.target.value)} /></label>
          <label className="field-label">팀 목표 <input className="context-input" value={goal} maxLength={120} placeholder="예: 3개월 안에 고객용 모바일 서비스를 출시하고 초기 사용자를 확보합니다." onChange={(e) => setGoal(e.target.value)} /></label>
          <p className="goal-help">달성하려는 결과와 기한, 성공 기준을 구체적으로 적어주세요. AI가 회사 맥락 안에서 이 팀 목표를 분석합니다.</p>
          <label className="field-label">팀이 이루려는 목적과 상황 <textarea className="context-input context-area" value={purpose} maxLength={1200} placeholder="예: 3개월 안에 고객용 모바일 서비스를 출시해야 합니다. 의사결정이 빠르고, 개발·디자인·마케팅 사이의 협업이 중요합니다. 현재는 일정 지연과 의견 충돌이 잦습니다." onChange={(e) => setPurpose(e.target.value)} /></label>
          <span className="context-count">{purpose.length}/1200</span>
        </div>

          <p className="saju-note">사주 참고 분석은 선택 사항입니다. 생년월일과 생시를 입력한 팀원만 전통 명리학 기반 참고 해석에 포함됩니다.</p>
        <div className="roster">
          {members.map((m, i) => (
            <div className="roster-row" key={m.id}>
              <span className="rn">{String(i + 1).padStart(2, "0")}</span>
              <input className="in-name" value={m.name} placeholder="이름" onChange={(e) => update(m.id, { name: e.target.value })} />
              <input className="in-role" value={m.role || ""} placeholder="역할" onChange={(e) => update(m.id, { role: e.target.value })} />
              <button className={`in-type ${m.type ? "" : "in-empty"}`} onClick={() => setPicking(picking === m.id ? null : m.id)}>
                {m.type || "MBTI 선택"}
                {m.type && <em>{TYPE_META[m.type].nick}</em>}
              </button>
              <input className="in-note" value={m.note || ""} placeholder="업무 스타일·고민·강점 (선택)" onChange={(e) => update(m.id, { note: e.target.value })} />
              <div className="saju-fields"><span>사주 참고</span><input type="date" min="1950-01-01" max={TODAY} value={m.birthDate || ""} aria-label={`${m.name || "팀원"} 생년월일`} onChange={(e) => update(m.id, { birthDate: e.target.value })} /><input type="time" value={m.birthTime || ""} aria-label={`${m.name || "팀원"} 생시`} onChange={(e) => update(m.id, { birthTime: e.target.value })} /><select value={m.birthCalendar || "solar"} onChange={(e) => update(m.id, { birthCalendar: e.target.value })}><option value="solar">양력</option><option value="lunar">음력</option></select><select value={m.gender || "unknown"} onChange={(e) => update(m.id, { gender: e.target.value })}><option value="unknown">성별 미입력</option><option value="male">남성</option><option value="female">여성</option></select></div>
              <button className="x" onClick={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))} aria-label="팀원 삭제">✕</button>

              {picking === m.id && (
                <div className="picker">
                  {GROUPS.map((g) => (
                    <div className="pick-row" key={g.key}>
                      <span className="pick-lab">{g.key}<em>{g.label}</em></span>
                      <div className="pick-tiles">
                        {g.types.map((t) => (
                          <Tile key={t} type={t} size="sm" active={m.type === t} onClick={() => { update(m.id, { type: t }); setPicking(null); }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="actions">
          <button className="btn-ghost" disabled={members.length >= 10} onClick={() => setMembers((ms) => [...ms, { id: ++uid, name: "", type: "", birthDate: "", birthTime: "", birthCalendar: "solar", gender: "unknown" }])}>
            팀원 추가 {members.length >= 10 && "(최대 10명)"}
          </button>
          <button className="btn-main" disabled={!ready || !teamName.trim() || !goal.trim() || !industry || !companyCulture || !leadership || purpose.trim().length < 20 || llm.loading} onClick={run}>
            {llm.loading ? "분석하는 중…" : "팀 케미 분석하기"}
          </button>
        </div>
        {!ready && <p className="hint">MBTI가 채워진 팀원이 2명 이상이어야 분석할 수 있어요.</p>}
      </section>

      {/* ── 결과 ── */}
      {result && (
        <>
          <section className="hero">
            <div className="hero-tile" style={{ "--tint": `var(${AXIS_VAR[result.sorted[0]]})` }}>
              <span className="ht-eyebrow">TEAM CODE</span>
              <span className="ht-code">{result.code}</span>
              <span className="ht-note">대문자 = 강한 우세(70%↑) · 소문자 = 약한 우세</span>
            </div>
            <div className="hero-body">
              <div className="score-line">
                <span className="score-num">{result.chemistry}</span>
                <span className="score-den">/ 100</span>
                <span className="score-lab">팀 케미 점수</span>
              </div>
              <div className="score-break">
                <span>1:1 궁합 평균 <b>{Math.round(result.avgPair)}</b> × 60%</span>
                <span>성향 균형도 <b>{Math.round(result.balance)}</b> × 40%</span>
              </div>
              <h3 className="team-type">{result.teamType.name}</h3>
              <p className="team-desc">{result.teamType.desc}</p>
            </div>
          </section>

          <nav className="tabs">
            {[["chem", "케미 분석"], ["pair", "1:1 궁합"], ["role", "역할 배분"], ["sim", "영입 시뮬레이션"]].map(([k, v]) => (
              <button key={k} className={`tab ${tab === k ? "tab-on" : ""}`} onClick={() => setTab(k)}>{v}</button>
            ))}
          </nav>

          {/* 케미 분석 */}
          {tab === "chem" && (
            <section className="panel">
              <div className="panel-hd"><span className="tag">01</span><h2>강점 배합비</h2></div>
              <div className="mix">
                <div className="mix-stack">
                  {AXIS_LIST.map((a) => (
                    <div key={a} className="mix-seg" style={{ width: `${result.mix[a]}%`, background: `var(${AXIS_VAR[a]})` }} title={`${a} ${Math.round(result.mix[a])}%`}>
                      {result.mix[a] > 9 && <span>{a} {Math.round(result.mix[a])}%</span>}
                    </div>
                  ))}
                </div>
                <div className="dims">
                  {[["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]].map(([a, b]) => (
                    <div className="dim" key={a}>
                      <span className={result.ratio[a] >= result.ratio[b] ? "on" : ""}>{a} {Math.round(result.ratio[a] * 100)}%</span>
                      <div className="dim-track"><div className="dim-fill" style={{ width: `${result.ratio[a] * 100}%` }} /></div>
                      <span className={result.ratio[b] > result.ratio[a] ? "on" : ""}>{Math.round(result.ratio[b] * 100)}% {b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="roster-tiles">
                {result.members.map((m, i) => <Tile key={m.id} type={m.type} index={i + 1} name={m.name} />)}
              </div>

              <div className="panel-hd mt"><span className="tag">02</span><h2>강점 분석</h2><span className="by-ai">AI 해설</span></div>
              {llm.loading && <div className="skel"><i /><i /><i /></div>}
              {llm.error && <p className="err">{llm.error}</p>}
              {llm.s && (
                <>
                  {llm.s.organizationCulture && <div className="culture-report"><div className="culture-block"><div className="section-kicker">01 · COMPANY CULTURE</div><h3>{llm.s.organizationCulture.headline}</h3><p>{llm.s.organizationCulture.description}</p><ul>{llm.s.organizationCulture.signals?.map((item, i) => <li key={i}>{item}</li>)}</ul></div><div className="culture-block culture-team"><div className="section-kicker">02 · TEAM CULTURE</div><h3>{llm.s.teamCulture?.headline}</h3><p>{llm.s.teamCulture?.description}</p><ul>{llm.s.teamCulture?.operatingPrinciples?.map((item, i) => <li key={i}>{item}</li>)}</ul></div></div>}
                  <p className="lead">{llm.s.summary}</p>
                  <div className="cards">
                    {(llm.s.strengths || []).map((s, i) => (
                      <div className="card" key={i}><h4>{s.title}</h4><p>{s.detail}</p></div>
                    ))}
                  </div>
                  {llm.s.memberInsights?.length > 0 && (
                    <div className="member-insights">
                      {llm.s.memberInsights.map((m, i) => (
                        <div className="member-insight" key={i}><h4>{m.name}</h4><p>{m.contribution}</p><small>협업 포인트 · {m.watchout}</small></div>
                      ))}
                    </div>
                  )}
                  {hasSajuInput && (llm.s.sajuSummary || llm.s.sajuInsights?.length > 0) && <div className="saju-report"><div className="section-kicker">SAJU REFERENCE · 전통 명리학 참고</div><p className="lead">{llm.s.sajuSummary}</p>{llm.s.sajuInsights?.map((m, i) => <div className="saju-insight" key={i}><h4>{m.name} <small>{m.dayMaster}</small></h4><p>{m.elementSummary}</p><small>협업 적용 · {m.collaboration}</small>{m.mbtiSajuProfile && <div className="mbti-saju-profile"><b>MBTI × 사주 개인 해석</b><p>{m.mbtiSajuProfile}</p></div>}</div>)}<p className="disclaimer">※ 사주 해석은 입력된 출생 정보의 만세력 결과와 표면 오행 분포를 바탕으로 한 문화적 참고 정보이며, 과학적 진단이나 미래 예측이 아닙니다.</p></div>}
                </>
              )}

              <div className="panel-hd mt"><span className="tag">03</span><h2>잠재 갈등 포인트</h2></div>
              <p className="lead">팀 목표와 상황, 각 팀원의 MBTI·직무·업무 스타일을 AI가 종합해 실제 업무 장면으로 재구성한 협업 시나리오입니다.</p>
              {displayedConflicts.length === 0 && <p className="lead">현재 입력을 기준으로 뚜렷한 갈등 가능성이 발견되지 않았어요.</p>}
              <div className="conf-list">
                {displayedConflicts.map((c, i) => (
                    <div className="conf" key={i}>
                      <div className="conf-hd"><span className="conf-n">{String(i + 1).padStart(2, "0")}</span><h4>{c.title}</h4></div>
                      {c.people && <p className="conf-people">관련 · {c.people}</p>}
                      <p className="conf-why">{c.scenario}</p>
                      {c.why && <p className="conf-reason">배경 · {c.why}</p>}
                      <p className="conf-fix"><span>해결</span>{c.advice}</p>
                    </div>
                ))}
              </div>

              {llm.c?.scenarios && (
                <div className="scenario-grid">
                  {[['conflict','가장 크게 부딪히는 경우','scenario-risk'],['synergy','가장 크게 시너지가 나는 경우','scenario-win']].map(([kind,label,tone]) => {
                    const s = llm.c.scenarios[kind];
                    return <article className={`scenario-card ${tone}`} key={kind}><span className="scenario-label">AI SCENARIO · {label}</span><h3>{s.title}</h3><b>언제</b><p>{s.when}</p><b>사례</b><p>{s.case}</p><b>해석</b><p>{s.reading}</p><div className="scenario-action"><strong>액션</strong>{s.move}</div></article>;
                  })}
                </div>
              )}

              <div className="panel-hd mt"><span className="tag">04</span><h2>이 팀에 필요한 유형</h2></div>
              <p className="lead">성향 균형, 기존 멤버와의 궁합, 가장 약한 축(<b>{result.weakAxis}</b>) 보강력을 함께 계산한 보완도 순위입니다.</p>
              <div className="comp-row">
                {result.complements.map((c, i) => (
                  <div className="comp" key={c.type}>
                    <span className="comp-rank">{i + 1}</span>
                    <Tile type={c.type} size="sm" />
                    <span className="comp-fit">{c.fit}<em>보완도</em></span>
                    <span className={`comp-delta ${c.delta >= 0 ? "up" : "down"}`}>케미 {c.delta >= 0 ? "+" : ""}{c.delta}</span>
                  </div>
                ))}
              </div>

              <div className="panel-hd mt"><span className="tag">05</span><h2>협업 팁 · 팀 빌딩 활동</h2><span className="by-ai">AI 해설</span></div>
              <div className="two">
                <div>
                  <span className="field-label">협업 팁</span>
                  {llm.loading && <div className="skel"><i /><i /></div>}
                  <ul className="tips">{(llm.c?.tips || []).map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
                <div>
                  <span className="field-label">추천 활동 <em>{result.sorted[0]} 우세 · {result.introverted ? "내향 다수" : "외향 다수"}</em></span>
                  <ul className="tips">{result.activities.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              </div>
            </section>
          )}

          {/* 1:1 궁합 */}
          {tab === "pair" && (
            <section className="panel">
              <div className="panel-hd"><span className="tag">MATRIX</span><h2>1:1 궁합 반응표</h2></div>
              <p className="lead">차원별 일치/불일치 규칙표 + 상위 인지기능 공유 가산점으로 계산합니다. 진할수록 높은 점수예요.</p>
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr><th /> {result.members.map((m) => <th key={m.id}><span>{m.name}</span><em>{m.type}</em></th>)}</tr>
                  </thead>
                  <tbody>
                    {result.members.map((rm) => (
                      <tr key={rm.id}>
                        <th><span>{rm.name}</span><em>{rm.type}</em></th>
                        {result.members.map((cm) => {
                          if (rm.id === cm.id) return <td key={cm.id} className="self">—</td>;
                          const p = result.pairs.find((x) => (x.a.id === rm.id && x.b.id === cm.id) || (x.a.id === cm.id && x.b.id === rm.id));
                          const t = (p.score - 30) / 68;
                          return <td key={cm.id} style={{ background: `rgba(59,79,216,${0.08 + t * 0.72})`, color: t > 0.5 ? "#fff" : "var(--ink)" }}>{p.score}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel-hd mt"><span className="tag">PICK</span><h2>파트너십 추천</h2></div>
              {llm.s?.pairTip && <p className="lead">{llm.s.pairTip}</p>}
              <div className="pair-list">
                {[...result.pairs].sort((a, b) => b.score - a.score).map((p, i) => (
                  <div className={`pair pair-${p.grade.tone}`} key={i}>
                    <div className="pair-hd">
                      <span className="pair-who">{p.a.name} <b>{p.a.type}</b> <i>↔</i> {p.b.name} <b>{p.b.type}</b></span>
                      <span className="pair-score">{p.score}<em>{p.grade.label}</em></span>
                    </div>
                    <ul className="pair-notes">
                      {p.notes.map((n, j) => <li key={j} className={n.same ? "same" : "diff"}>{n.dim} {n.same ? "일치" : "보완"} · {n.note}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 역할 배분 */}
          {tab === "role" && (
            <section className="panel">
              <div className="panel-hd"><span className="tag">ROLE</span><h2>개인별 기본 역할</h2></div>
              <div className="role-grid">
                {result.members.map((m) => {
                  const ax = axisScores(m.type);
                  const top = [...AXIS_LIST].sort((a, b) => ax[b] - ax[a])[0];
                  return (
                    <div className="role-card" key={m.id} style={{ "--tint": `var(${AXIS_VAR[top]})` }}>
                      <div className="role-hd"><span className="role-sym">{m.type}</span><div><strong>{m.name}</strong><em>{AXIS_ROLE[top]}</em></div></div>
                      {AXIS_LIST.map((a) => <Bar key={a} label={a} value={ax[a]} colorVar={AXIS_VAR[a]} />)}
                    </div>
                  );
                })}
              </div>

              <div className="panel-hd mt"><span className="tag">STAGE</span><h2>단계별 최적 역할 배분</h2></div>
              <p className="lead">{goal} 기준. 각 단계에서 해당 축 점수가 높은 순으로 배정했어요.</p>
              <div className="stages">
                {result.stages.map((s) => (
                  <div className="stage" key={s.stage} style={{ "--tint": `var(${AXIS_VAR[s.axis]})` }}>
                    <div className="stage-hd"><h4>{s.stage}</h4><span>{s.axis} 우선</span></div>
                    <div className="stage-picks">
                      {s.picks.map((p) => <span className="pill" key={p.id}>{p.name}<em>{p.type}</em></span>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 시뮬레이션 */}
          {tab === "sim" && (
            <section className="panel">
              <div className="panel-hd"><span className="tag">SIM</span><h2>신규 팀원 영입 시뮬레이션</h2></div>
              <p className="lead">유형을 고르면 합류 후 팀 케미가 어떻게 변하는지 계산합니다. 현재 점수 <b>{result.chemistry}</b>점.</p>
              <div className="sim-picker">
                {GROUPS.map((g) => (
                  <div className="pick-row" key={g.key}>
                    <span className="pick-lab">{g.key}<em>{g.label}</em></span>
                    <div className="pick-tiles">
                      {g.types.map((t) => {
                        const d = analyzeCore([...result.members.map((m) => m.type), t]).chemistry - result.chemistry;
                        return (
                          <button key={t} className={`sim-tile ${simType === t ? "tile-on" : ""} ${d >= 0 ? "up" : "down"}`} onClick={() => setSimType(t)}>
                            <span className="tile-sym">{t}</span>
                            <span className="sim-d">{d >= 0 ? "+" : ""}{d}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {sim && (
                <div className="sim-out">
                  <div className="sim-head">
                    <div><span className="field-label">합류 후 팀 코드</span><span className="sim-code">{result.code} → <b>{sim.after.code}</b></span></div>
                    <div><span className="field-label">케미 점수</span><span className="sim-code">{result.chemistry} → <b>{sim.after.chemistry}</b> <em className={sim.delta >= 0 ? "up" : "down"}>{sim.delta >= 0 ? "+" : ""}{sim.delta}</em></span></div>
                    <div><span className="field-label">팀 유형</span><span className="sim-code">{sim.after.teamType.name}</span></div>
                  </div>
                  <div className="sim-mix">
                    {AXIS_LIST.map((a) => {
                      const d = sim.after.mix[a] - result.mix[a];
                      return <Bar key={a} label={a} value={sim.after.mix[a]} colorVar={AXIS_VAR[a]} right={`${Math.round(sim.after.mix[a])}% (${d >= 0 ? "+" : ""}${Math.round(d)})`} />;
                    })}
                  </div>
                  <div className="sim-conf">
                    <span className="field-label">합류 후 갈등 신호</span>
                    {sim.after.conflicts.length === 0 ? <p className="lead">감지된 신호 없음</p> : (
                      <ul className="tips">{sim.after.conflicts.map((c, i) => {
                        const isNew = !result.conflicts.some((x) => x.title === c.title);
                        return <li key={i}>{c.title} {isNew && <em className="new">신규</em>}</li>;
                      })}</ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {shareEnabled && (
            <section className="panel share">
              <div className="panel-hd"><span className="tag">SHARE</span><h2>결과 공유</h2></div>
              {loadedFrom && <p className="lead">{loadedFrom}에 저장된 분석을 불러왔어요.</p>}
              <p className="lead">
                링크를 만들면 팀원 이름과 MBTI가 Supabase에 <b>30일간</b> 저장됩니다. 링크를 아는 사람은 누구나 볼 수 있어요.
              </p>
              {share.slug ? (
                <div className="share-out">
                  <input readOnly className="share-url" value={`${window.location.origin}${window.location.pathname}?share=${share.slug}`} onFocus={(e) => e.target.select()} />
                  <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?share=${share.slug}`)}>복사</button>
                </div>
              ) : (
                <button className="btn-ghost" disabled={share.saving} onClick={createShare}>
                  {share.saving ? "저장하는 중…" : "공유 링크 만들기"}
                </button>
              )}
              {share.error && <p className="err">{share.error}</p>}
            </section>
          )}

          <footer className="ft">
            MBTI는 성격을 확정하는 진단이 아니라 협업 경향을 비추는 도구예요. 결과는 대화의 출발점으로만 쓰고, 사람을 유형에 가두지 않기.
          </footer>
        </>
      )}
      </div>
    </div>
  );
}

