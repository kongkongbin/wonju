// 판정 정확도 예비 평가: npm run eval:triage        (단계마다 앞 N건만: npm run eval:triage -- 1)
// 대회 서버에서 돌리면 .env의 AI_PROVIDER=bedrock 그대로 Sonnet 5.5로 평가된다.
import { writeFile } from 'node:fs/promises';
import { triage } from './triage.js';
import { CASES } from './eval-cases.js';

const perLevel = Number(process.argv[2]) || Infinity;
const cases = CASES.filter((c, i) => CASES.slice(0, i).filter((x) => x.level === c.level).length < perLevel);
const PARALLEL = 4;
const PRICE = { opus: [4, 20], sonnet: [2, 10] }; // 백만 토큰당 달러 (입력, 출력)

const rows = [];
for (let i = 0; i < cases.length; i += PARALLEL) {
  const batch = cases.slice(i, i + PARALLEL).map(async (c) => {
    const start = Date.now();
    try {
      const r = await triage(c.input);
      const symptom = `${r.symptom.population}:${r.symptom.name}`;
      return { ...c, got: r.finalLevel, ai: r.llmLevel, call119: r.call119, symptom, confidence: r.confidence, usage: r.usage, model: r.model, sec: (Date.now() - start) / 1000 };
    } catch (e) {
      return { ...c, error: e.message };
    }
  });
  rows.push(...(await Promise.all(batch)));
  process.stdout.write(`\r${rows.length}/${cases.length}건`);
}

const ok = rows.filter((r) => !r.error);
const n = ok.length;
const count = (f, list = ok) => list.filter(f).length;
const pct = (v, d = n) => `${v}/${d} (${d ? Math.round((v / d) * 100) : 0}%)`;
const severe = ok.filter((r) => r.level <= 2);
const mild = ok.filter((r) => r.level >= 4);
const model = ok[0]?.model ?? '모델 모름';

console.log(`\n\n판정 정확도 예비 평가 (${model}) ${n}건${rows.length > n ? `, 오류 ${rows.length - n}건` : ''}`);
console.log(`정확히 맞음            ${pct(count((r) => r.got === r.level))}`);
console.log(`±1단계 안              ${pct(count((r) => Math.abs(r.got - r.level) <= 1))}`);
console.log(`덜 위급하게(과소분류)  ${pct(count((r) => r.got > r.level))}  ← 가장 위험한 오류`);
console.log(`더 위급하게(과대분류)  ${pct(count((r) => r.got < r.level))}`);
console.log(`안전 규칙 전 AI만      정확히 맞음 ${pct(count((r) => r.ai === r.level))}, 과소분류 ${pct(count((r) => r.ai > r.level))}`);
console.log(`119 안내               KTAS 1~2 사례 중 ${pct(count((r) => r.call119, severe), severe.length)}, KTAS 4~5 사례에 잘못 안내 ${pct(count((r) => r.call119, mild), mild.length)}`);

console.log('\n정답 \\ 판정   1  2  3  4  5');
for (let e = 1; e <= 5; e++) {
  console.log(`KTAS ${e}      ${[1, 2, 3, 4, 5].map((g) => String(count((r) => r.level === e && r.got === g)).padStart(2)).join(' ')}`);
}

const sum = (f) => ok.reduce((s, r) => s + f(r), 0);
const inTok = sum((r) => r.usage.input_tokens);
const outTok = sum((r) => r.usage.output_tokens);
const [pin, pout] = PRICE[Object.keys(PRICE).find((k) => model.includes(k))] ?? [];
const cost = pin ? `, 비용 약 $${((inTok * pin + outTok * pout) / 1e6).toFixed(2)}` : '';
console.log(`\n토큰 입력 ${inTok} / 출력 ${outTok}, 한 건 평균 ${(sum((r) => r.sec) / (n || 1)).toFixed(1)}초${cost}`);

console.log('\n틀린 사례');
for (const r of ok.filter((r) => r.got !== r.level)) {
  console.log(`  [정답 ${r.level} → 판정 ${r.got}${r.ai !== r.got ? ` (AI ${r.ai}, 안전 규칙으로 올림)` : ''}] ${r.input}`);
  console.log(`      근거: ${r.basis}\n      고른 증상: ${r.symptom}`);
}
for (const r of rows.filter((r) => r.error)) console.log(`  [오류] ${r.input}: ${r.error}`);

const out = new URL(`../../../data/eval-triage-${model.replace(/[^\w.-]/g, '_')}.json`, import.meta.url);
await writeFile(out, JSON.stringify(rows, null, 2));
console.log(`\n전체 결과: data/${out.pathname.split('/').pop()}`);
