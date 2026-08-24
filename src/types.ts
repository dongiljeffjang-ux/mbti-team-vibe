export type Context = 'kickoff' | 'ideation' | 'execution' | 'conflict' | 'daily';
export type Member = { id: string; name: string; mbti: string; preferences: Record<string, number> };
export type TeamInput = { teamName: string; goal: string; context: Context; members: Member[] };
export type Analysis = ReturnType<typeof import('./lib/analyzeTeam').analyzeTeam>;
