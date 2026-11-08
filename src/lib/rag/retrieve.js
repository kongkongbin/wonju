import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { embed } from './embed.js';

const KB_PATH = process.env.KB_PATH ?? fileURLToPath(new URL('../../../data/kb.json', import.meta.url));
const LEX_SLOTS = 3; // 후보 끝자리 중 키워드 검색 결과로 채우는 수 (topK의 절반까지)
let kb;
let lexScores;

async function loadKb() {
  if (!kb) {
    kb = JSON.parse(await readFile(KB_PATH, 'utf8'));
    lexScores = bm25(kb.chunks.map((c) => `${c.name} ${c.aliases ?? ''}`));
  }
  return kb;
}

// 벡터가 이미 정규화되어 있으므로 내적이 곧 코사인 유사도
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// 글자 2-gram: 형태소 분석 없이 '경련을'·'경련이' 같은 활용형도 '경련'으로 겹치게 한다
const bigrams = (text) =>
  text.split(/[^가-힣a-zA-Z0-9]+/).flatMap((w) => Array.from({ length: Math.max(w.length - 1, 0) }, (_, i) => w.slice(i, i + 2)));

/**
 * BM25 (k1=1.2, b=0.75) 키워드 검색
 * @param {string[]} texts 문서들
 * @returns {(query: string) => number[]} 질의 → 문서별 점수 (texts 순서)
 */
function bm25(texts) {
  const docs = texts.map(bigrams);
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const tfs = docs.map((d) => d.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map()));
  return (query) => {
    const terms = [...new Set(bigrams(query))];
    return tfs.map((tf, i) =>
      terms.reduce((s, t) => {
        const f = tf.get(t);
        if (!f) return s;
        const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
        return s + (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * docs[i].length) / avgLen));
      }, 0),
    );
  };
}

/**
 * 입력 문장에서 소아/성인을 추정한다. 단서가 없으면 undefined (양쪽 모두 검색).
 * KTAS는 만 15세 미만을 소아로 구분한다.
 * @param {string} query
 * @returns {'소아'|'성인'|undefined}
 */
export function detectPopulation(query) {
  const age = query.match(/(\d{1,3})\s*(?:살|세)/);
  if (age) return Number(age[1]) < 15 ? '소아' : '성인';
  // '아이'는 아이스크림·아이폰·아이고 같은 단어에 걸리지 않게 뒤 글자를 제외한다
  if (/\d+\s*개월|아이(?!스|디|폰|패드|템|돌|고)|아기|애기|영아|유아|신생아|소아|어린이|초등학생|유치원/.test(query)) return '소아';
  if (/아버지|어머니|할머니|할아버지|남편|아내|어르신|노인/.test(query)) return '성인';
  return undefined;
}

/**
 * 검색 대상이 된 증상 기준 수 (화면의 "N개 중 8개")
 * @param {'소아'|'성인'|undefined} population 모르면 소아·성인 전체
 */
export async function symptomCount(population) {
  const { chunks } = await loadKb();
  return chunks.filter((c) => c.kind === 'symptom' && (!population || c.population === population)).length;
}

/**
 * @param {string} query 사용자 증상 입력
 * @param {number} [topK]
 * @param {{kind?: 'symptom'|'common', population?: '소아'|'성인'|'auto'|'any'}} [opts] 기본은 증상 청크만, 소아/성인은 문장에서 자동 추정
 * @returns {Promise<Array<{id:string, kind:string, population:string, name:string, levels?:string[], text:string, score:number}>>}
 */
export async function retrieve(query, topK = 3, { kind = 'symptom', population = 'auto' } = {}) {
  const { chunks } = await loadKb();
  // 임베딩 API가 안 돼도 판정을 멈추지 않는다: 키워드 검색 순위만으로 후보를 고른다
  const q = await embed(query).catch((e) => {
    console.error('[retrieve] 임베딩 실패, 키워드 검색만 사용:', e.message);
    return null;
  });
  const lex = lexScores(query);
  const pop = population === 'auto' ? detectPopulation(query) : population === 'any' ? undefined : population;
  const ranked = chunks
    .map(({ embedding, ...c }, i) => ({ ...c, score: q ? dot(q, embedding) : lex[i], lex: lex[i] }))
    .filter((c) => c.kind === kind && (!pop || c.population === pop))
    .sort((a, b) => b.score - a.score);
  if (!q) return ranked.slice(0, topK);

  // 임베딩은 '경련'↔'발작'처럼 표현이 다르면 놓치고, 여러 증상이 섞인 문장에서는 한 증상(고열 등)에 끌려간다.
  // 그래서 끝자리 몇 개는 일상어 표현(aliases)과 글자가 겹치는 키워드 검색 상위 결과로 채운다.
  const top = ranked.slice(0, topK);
  const extra = ranked
    .filter((c) => c.lex > 0 && !top.includes(c))
    .sort((a, b) => b.lex - a.lex)
    .slice(0, Math.min(LEX_SLOTS, Math.floor(topK / 2)));
  return [...top.slice(0, topK - extra.length), ...extra];
}
