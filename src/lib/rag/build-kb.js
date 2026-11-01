import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { embed, DEFAULT_MODEL as MODEL } from './embed.js';
import { lookupAliases } from './aliases.js';

// 입력: scripts/chunk-ktas.js 가 만든 data/ktas-chunks.json (KTAS 2021 지침서 기반)
const SRC = fileURLToPath(new URL('../../../data/ktas-chunks.json', import.meta.url));
const OUT = process.env.KB_OUT ?? fileURLToPath(new URL('../../../data/kb.json', import.meta.url));

const chunks = JSON.parse(await readFile(SRC, 'utf8'));
console.log(`청크 ${chunks.length}개 임베딩 시작 (모델: ${MODEL})`);

const t0 = Date.now();
const missing = [];
for (const [i, c] of chunks.entries()) {
  // 환자 일상어 표현(aliases)을 앞에 붙여 임베딩한다. KTAS 원문(text)은 그대로 보존.
  if (c.kind === 'symptom') {
    c.aliases = lookupAliases(c.name);
    if (!c.aliases) missing.push(c.name);
  }
  const input = c.aliases ? `${c.population} ${c.name}. ${c.aliases}. ${c.embedText}` : c.embedText;
  c.embedding = await embed(input, 'passage', MODEL);
  if ((i + 1) % 50 === 0 || i + 1 === chunks.length) console.log(`  ${i + 1}/${chunks.length}`);
}
if (missing.length) console.warn(`일상어 표현 없는 증상: ${[...new Set(missing)].join(', ')}`);

await writeFile(OUT, JSON.stringify({ model: MODEL, dim: chunks[0].embedding.length, chunks }));
console.log(`저장: ${OUT} (차원 ${chunks[0].embedding.length}, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
