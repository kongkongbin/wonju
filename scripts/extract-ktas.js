// KTAS 지침서 pptx → 슬라이드별 구조화 JSON (data/ktas-slides.json)
// 사용: node scripts/extract-ktas.js <pptx 경로>
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { mkdirSync, writeFileSync } from 'node:fs';

const src = process.argv[2] ?? '2021_KTAS_guideline_ver1.6.pptx';
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
});

const zip = new AdmZip(src);
const read = (p) => zip.readAsText(p);

const tagOf = (n) => Object.keys(n).find((k) => k !== ':@');
const kids = (n) => n[tagOf(n)] ?? [];
const attr = (n, k) => n[':@']?.[`@_${k}`];

/** 노드 아래의 a:p(문단)를 모아 문단별 문자열로 */
function paragraphs(node) {
  const out = [];
  (function walk(n) {
    const t = tagOf(n);
    if (t === 'a:p') {
      let s = '';
      (function runs(m) {
        const mt = tagOf(m);
        if (mt === 'a:t') s += kids(m).map((x) => x['#text'] ?? '').join('');
        else if (mt === 'a:br') s += ' ';
        else kids(m).forEach(runs);
      })(n);
      s = s.replace(/\s+/g, ' ').trim();
      if (s) out.push(s);
    } else kids(n).forEach(walk);
  })(node);
  return out;
}

function parseTable(tbl) {
  const rows = [];
  for (const tr of kids(tbl).filter((n) => tagOf(n) === 'a:tr')) {
    const cells = [];
    for (const tc of kids(tr).filter((n) => tagOf(n) === 'a:tc')) {
      // 병합으로 가려진 칸은 빈 문자열로 둬서 열 위치를 유지
      const hidden = attr(tc, 'hMerge') || attr(tc, 'vMerge');
      cells.push(hidden ? '' : paragraphs(tc).join(' / '));
    }
    rows.push(cells);
  }
  return rows;
}

function blocks(spTree) {
  const out = [];
  (function walk(n) {
    const t = tagOf(n);
    if (t === 'p:sp') {
      const lines = paragraphs(n);
      if (lines.length) out.push({ type: 'text', lines });
    } else if (t === 'a:tbl') {
      out.push({ type: 'table', rows: parseTable(n) });
    } else if (t === 'p:spTree' || t === 'p:grpSp' || t === 'p:graphicFrame' || t === 'a:graphic' || t === 'a:graphicData') {
      kids(n).forEach(walk);
    }
  })(spTree);
  return out;
}

// 슬라이드 순서: presentation.xml 의 sldIdLst + rels
const pres = parser.parse(read('ppt/presentation.xml'));
const rels = parser.parse(read('ppt/_rels/presentation.xml.rels'));
const relMap = {};
(function walk(ns) {
  for (const n of ns) {
    if (tagOf(n) === 'Relationship') relMap[attr(n, 'Id')] = attr(n, 'Target');
    else if (Array.isArray(kids(n))) walk(kids(n));
  }
})(rels);
const order = [];
(function walk(ns) {
  for (const n of ns) {
    if (tagOf(n) === 'p:sldId') order.push(relMap[attr(n, 'r:id')]);
    else if (Array.isArray(kids(n))) walk(kids(n));
  }
})(pres);

const slides = order.map((target, i) => {
  const xml = parser.parse(read(`ppt/${target}`));
  let tree;
  (function find(ns) {
    for (const n of ns) {
      if (tagOf(n) === 'p:spTree') tree = n;
      else if (Array.isArray(kids(n))) find(kids(n));
    }
  })(xml);
  return { n: i + 1, file: target, blocks: blocks(tree) };
});

mkdirSync('data', { recursive: true });
writeFileSync('data/ktas-slides.json', JSON.stringify(slides, null, 1));
const withTable = slides.filter((s) => s.blocks.some((b) => b.type === 'table')).length;
console.log(`슬라이드 ${slides.length}장, 표 포함 ${withTable}장, 텍스트 없음 ${slides.filter((s) => !s.blocks.length).length}장`);
