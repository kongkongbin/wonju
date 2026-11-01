import { retrieve, detectPopulation } from './retrieve.js';
import { CASES } from './eval-cases.js';

const K = 8;
const hits = { 1: 0, 3: 0, 5: 0, [K]: 0 };
let popKnown = 0;
let popRight = 0;
let popWrong = 0;
const nameHits = { 1: 0, 3: 0, 5: 0, [K]: 0 };
const fails = [];

for (const c of CASES) {
  const results = await retrieve(c.input, K);
  const rank = results.findIndex((r) => r.population === c.pop && c.expect.includes(r.name)) + 1;
  for (const k of Object.keys(hits)) if (rank > 0 && rank <= Number(k)) hits[k]++;

  // 인구군 무시: 같은 증상명이 소아/성인 어느 쪽이든 (서로 다른 증상명만 센다)
  const seen = [];
  for (const r of results) if (!seen.includes(r.name)) seen.push(r.name);
  const nameRank = seen.findIndex((nm) => c.expect.includes(nm)) + 1;
  for (const k of Object.keys(nameHits)) if (nameRank > 0 && nameRank <= Number(k)) nameHits[k]++;

  const detected = detectPopulation(c.input);
  if (detected) {
    popKnown++;
    detected === c.pop ? popRight++ : popWrong++;
  }
  if (rank === 0 || rank > 1) {
    fails.push({ rank: rank || `>${K}`, input: c.input, expect: c.expect.join(' / '), got: results.slice(0, 3).map((r) => `${r.population[0]}:${r.name}`).join(', ') });
  }
}

const n = CASES.length;
const pct = (v) => `${v}/${n} (${((v / n) * 100).toFixed(0)}%)`;
console.log(`평가 입력 ${n}건`);
console.log(`Hit@1 ${pct(hits[1])} | Hit@3 ${pct(hits[3])} | Hit@5 ${pct(hits[5])} | Hit@${K} ${pct(hits[K])}`);
console.log(`증상명만(인구군 무시) Hit@1 ${pct(nameHits[1])} | Hit@3 ${pct(nameHits[3])} | Hit@5 ${pct(nameHits[5])} | Hit@${K} ${pct(nameHits[K])}`);
console.log(`소아/성인 판별: 단서 있음 ${popKnown}건 중 정답 ${popRight}, 오판 ${popWrong} / 단서 없음 ${n - popKnown}건(양쪽 검색)`);
console.log('\nTop-1이 아닌 케이스');
for (const f of fails) console.log(`  [rank ${f.rank}] ${f.input}\n      기대: ${f.expect}\n      상위: ${f.got}`);
