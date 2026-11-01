import { retrieve } from './retrieve.js';

// expect: 정답으로 인정할 청크의 [인구군, 증상명] 후보 (KTAS 문서 기준)
const cases = [
  // 사용자가 요청한 3건
  { input: '아이가 40도 고열에 경련을 일으키고 입술이 파래져요', expect: [['소아', '발작'], ['소아', '열']] },
  { input: '아버지가 갑자기 말이 어눌해지고 오른쪽 팔에 힘이 하나도 없다고 하세요', expect: [['성인', '사지 약화 / 뇌졸중 증상']] },
  { input: '가슴이 쥐어짜듯 아프고 식은땀이 나요. 왼쪽 팔까지 저려요', expect: [['성인', '흉통 (심장성)']] },
  // 모델 비교용 추가 6건
  { input: '숨이 안 쉬어지고 입술이 파래져요', expect: [['성인', '숨참'], ['성인', '청색증']] },
  { input: '벌에 쏘인 뒤 온몸에 두드러기가 나고 목이 붓는 느낌이에요', expect: [['성인', '쏘임 (Sting)'], ['성인', '알레르기 반응']] },
  { input: '갑자기 벼락 치듯 머리가 깨질 것처럼 아파요', expect: [['성인', '두통']] },
  { input: '피를 토했어요', expect: [['성인', '토혈']] },
  { input: '오토바이 사고로 다리뼈가 살 밖으로 튀어나왔어요', expect: [['성인', '하지 손상']] },
  { input: '사람이 쓰러져서 의식이 없고 숨을 안 쉬어요', expect: [['성인', '심정지(비외상성)']] },
  // 임베딩만으로는 못 찾던 것: 여러 증상 중 하나, KTAS와 다른 표현 (키워드 검색으로 보완)
  { input: '아이가 40도 고열에 경련을 일으키고 입술이 파래져요', expect: [['소아', '발작']] },
  { input: '아이가 경기를 해요', expect: [['소아', '발작']] },
];

const isMatch = (r, expect) => expect.some(([pop, name]) => r.population === pop && r.name === name);

let top1 = 0;
let top5 = 0;
for (const { input, expect } of cases) {
  const results = await retrieve(input, 5);
  const t1 = isMatch(results[0], expect);
  const t5 = results.some((r) => isMatch(r, expect));
  if (t1) top1++;
  if (t5) top5++;
  console.log(`\n입력: ${input}\n기대: ${expect.map((e) => e.join(' ')).join(' 또는 ')}  →  Top-1 ${t1 ? 'PASS' : 'FAIL'}, Top-5 ${t5 ? 'PASS' : 'FAIL'}`);
  results.forEach((r, i) =>
    console.log(`  ${i + 1}. [${r.population ?? '공통'}] ${r.name.padEnd(18)} score=${r.score.toFixed(4)}  KTAS=${r.levels?.join(',') ?? '-'}  (${r.id})`),
  );
}
console.log(`\nTop-1 적중: ${top1}/${cases.length}, Top-5 적중: ${top5}/${cases.length}`);
