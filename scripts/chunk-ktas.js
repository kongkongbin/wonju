// data/ktas-slides.json → 증상 카테고리 단위 청크 (data/ktas-chunks.json)
import { readFileSync, writeFileSync } from 'node:fs';

const slides = JSON.parse(readFileSync('data/ktas-slides.json', 'utf8'));

const NOISE = [/^ￜ\s*\d+\s*ￜ$/, /^증상에 따른 중증\/긴급도 분류/];
const isNoise = (s) => NOISE.some((re) => re.test(s.trim()));
const isHeaderTable = (b) => b.type === 'table' && b.rows[0]?.[0] === 'Coding System';

/** 표 한 개를 읽기 쉬운 줄 목록으로 변환 */
function tableLines(rows) {
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (/^[1-5]$/.test(r[0])) return `KTAS ${r[0]}: ${r.slice(1).filter(Boolean).join(' | ')}`;
      return r.filter(Boolean).join(' | ');
    });
}

function slideLines(slide) {
  const out = [];
  for (const b of slide.blocks) {
    if (isHeaderTable(b)) continue;
    if (b.type === 'text') out.push(...b.lines.filter((l) => !isNoise(l)));
    else out.push(...tableLines(b.rows));
  }
  return out;
}

// 1) 공통 기준 (슬라이드 6~17: 의식·순환·호흡·체온·통증·출혈·사고기전·정신과 등)
const chunks = [];
const popOf = (n) => (n >= 192 ? '소아' : '성인');
for (const s of slides.filter((x) => (x.n >= 6 && x.n <= 17) || (x.n >= 193 && x.n <= 203))) {
  const lines = slideLines(s);
  if (lines.join('').length < 40) continue;
  chunks.push({
    id: `common-s${s.n}`,
    kind: 'common',
    population: popOf(s.n),
    name: lines[0].slice(0, 40),
    slides: [s.n],
    text: lines.join('\n'),
    embedText: lines.join(' '),
  });
}

// 2) 증상 카테고리: 헤더 표(Coding System)가 나올 때마다 새 청크, 다음 헤더 전까지 이어붙임
const inSymptomRange = (n) => (n >= 35 && n <= 191) || (n >= 221 && n <= 388);
let cur = null;
for (const s of slides) {
  if (!inSymptomRange(s.n)) { cur = null; continue; }
  const header = s.blocks.find(isHeaderTable);
  if (header) {
    cur = {
      id: `${popOf(s.n) === '성인' ? 'adult' : 'peds'}-s${s.n}`,
      kind: 'symptom',
      population: popOf(s.n),
      name: header.rows[0][2]?.trim(),
      code: header.rows[1]?.[1],
      slides: [],
      lines: [],
    };
    chunks.push(cur);
  }
  if (cur) {
    cur.slides.push(s.n);
    cur.lines.push(...slideLines(s));
  }
}

const result = chunks.map((c) => {
  if (c.kind !== 'symptom') return c;
  const body = c.lines.join('\n');
  // 임베딩에는 증상명 + 판단 조건(단계 접두어 제외)만 사용 → 검색 신호 집중
  // 1차 고려사항 표(모든 증상 공통)는 뺀다. 슬라이드에 따라 2차 표보다 앞에 오기도 한다.
  let inPrimary = false;
  const secondary = c.lines.filter((l) => {
    if (l.endsWith('1차 고려사항')) inPrimary = true;
    else if (l === '증상별 2차 고려사항') inPrimary = false;
    return !inPrimary;
  });
  const levels = [...new Set(secondary.filter((l) => /^KTAS [1-5]:/.test(l)).map((l) => l[5]))].sort();
  const conds = secondary
    .filter((l) => l !== '증상별 2차 고려사항')
    .map((l) => l.replace(/^KTAS [1-5]: /, ''))
    .join(' ');
  return {
    id: c.id,
    kind: c.kind,
    population: c.population,
    name: c.name,
    code: c.code,
    slides: c.slides,
    levels,
    text: `[${c.population}] [증상] ${c.name} (NACRS ${c.code})\n${body}`,
    embedText: `${c.population} ${c.name}. ${conds}`,
  };
});

writeFileSync('data/ktas-chunks.json', JSON.stringify(result, null, 1));
const sym = result.filter((c) => c.kind === 'symptom');
const lens = sym.map((c) => c.text.length).sort((a, b) => a - b);
console.log(`청크 ${result.length}개 (공통 ${result.length - sym.length}, 증상 ${sym.length})`);
console.log(`증상 청크 길이: 최소 ${lens[0]}, 중앙 ${lens[lens.length >> 1]}, 최대 ${lens.at(-1)}`);
console.log(`본문 60자 미만(이미지 의존 가능성): ${sym.filter((c) => c.text.length < 60 + c.name.length + 20).map((c) => c.name).join(', ') || '없음'}`);
