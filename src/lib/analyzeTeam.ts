import type { Context, TeamInput } from '../types';

const axis: Record<string, [string, string]> = { E: ['E', 'I'], I: ['E', 'I'], S: ['S', 'N'], N: ['S', 'N'], T: ['T', 'F'], F: ['T', 'F'], J: ['J', 'P'], P: ['J', 'P'] };
const contextBoost: Record<Context, string[]> = { kickoff: ['E', 'N', 'J'], ideation: ['N', 'P', 'E'], execution: ['S', 'J', 'T'], conflict: ['F', 'T', 'I'], daily: ['E', 'F', 'J'] };
const roleRules = [{ name: '회의 진행자', letters: ['E', 'J'], icon: '🎙️' }, { name: '아이디어 확장자', letters: ['N', 'P'], icon: '💡' }, { name: '현실성 검토자', letters: ['S', 'T'], icon: '🔎' }, { name: '의사결정자', letters: ['T', 'J'], icon: '⚡' }, { name: '분위기 조율자', letters: ['E', 'F'], icon: '🤝' }, { name: '집중 실행자', letters: ['I', 'J'], icon: '🎯' }];
const strengthMap: Record<string, [string, string]> = { E: ['활발한 소통', '빠른 의견 교환과 분위기 활성화에 강해요.'], I: ['깊은 집중', '혼자 생각을 정리한 뒤 밀도 높은 의견을 만들어요.'], S: ['현실적인 실행력', '구체적인 계획과 디테일을 챙겨요.'], N: ['아이디어 확장', '큰 그림과 새로운 가능성을 발견해요.'], T: ['논리적 판단', '우선순위를 세우고 핵심을 빠르게 결정해요.'], F: ['관계 조율', '서로의 관점을 살피며 협력의 온도를 맞춰요.'], J: ['안정적인 운영', '일정과 마감, 다음 액션을 명확하게 만들어요.'], P: ['유연한 대응', '변화에 맞춰 대안을 빠르게 탐색해요.'] };
export function analyzeTeam(input: TeamInput) {
  const counts: Record<string, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  input.members.forEach(m => [...m.mbti].forEach(letter => counts[letter]++));
  const profile = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / input.members.length) * 100)]));
  const dominant = ['E','I','S','N','T','F','J','P'].sort((a,b) => counts[b] - counts[a]);
  const balance = ['E','S','T','J'].reduce((sum, a) => sum + Math.min(counts[a], counts[axis[a][1]]) / input.members.length * 5, 0);
  const fit = contextBoost[input.context].reduce((sum, l) => sum + (counts[l] / input.members.length) * 3, 0);
  const score = Math.max(42, Math.min(98, Math.round(55 + balance + fit)));
  const strengths = dominant.slice(0, 3).map(l => ({ title: strengthMap[l][0], text: strengthMap[l][1], letter: l }));
  const pairs = [['E','I','즉석 토론과 생각을 정리할 시간이 다를 수 있어요.'], ['S','N','구체적인 실행안과 큰 그림 사이에 온도 차이가 날 수 있어요.'], ['T','F','직설적인 피드백과 관계 중심 피드백이 부딪힐 수 있어요.'], ['J','P','미리 확정하려는 흐름과 유연하게 바꾸려는 흐름이 다를 수 있어요.']];
  const conflicts = pairs.filter(([a,b]) => counts[a] > 0 && counts[b] > 0).slice(0, 3).map(([a,b,text]) => ({ title: `${a}/${b} 관점 차이`, text, tip: '회의 전 의사결정 기준과 의견을 낼 시간을 먼저 합의해 보세요.' }));
  const roles = input.members.map(member => ({ member, role: roleRules.map(r => ({ ...r, score: [...member.mbti].filter(l => r.letters.includes(l)).length })).sort((a,b) => b.score - a.score)[0] }));
  return { counts, profile, score, strengths, conflicts, roles, summary: `${dominant[0]} 성향의 에너지와 ${dominant[2]} 관점이 어우러진 팀이에요.` };
}
