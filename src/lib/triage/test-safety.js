import { painSentence } from './body.js';
import { firstSentence, isMild, spokenSummary } from './spoken.js';
import assert from 'node:assert/strict';
import { safetyFloor, safetyText } from './safety.js';

const floorOf = (turns) => safetyFloor(safetyText(turns)).floor;

// 부정 답변: AI 질문에 든 키워드로 등급을 올리지 않는다
assert.equal(floorOf([{ text: '열이 나요' }, { text: '아니요', question: '경련이나 의식 저하가 있었나요?' }]), null);
assert.equal(floorOf([{ text: '없어요', question: '입술이 파랗게 변했나요?' }]), null);
assert.equal(floorOf([{ text: '안 그래요', question: '한쪽 팔다리에 힘이 빠지나요?' }]), null);

// 긍정·모호한 답변: 질문까지 검사해서 등급을 올린다
assert.equal(floorOf([{ text: '네', question: '경련이 있었나요?' }]), 2);
assert.equal(floorOf([{ text: '잘 모르겠어요', question: '입술이 파랗게 변했나요?' }]), 2);

// 부정으로 시작해도 답 자체에 위험 신호가 있으면 올린다
assert.equal(floorOf([{ text: '아니요, 근데 입술이 파래요', question: '열이 있나요?' }]), 2);

// 사용자가 직접 쓴 문장은 그대로 검사한다
assert.equal(floorOf([{ text: '사람이 쓰러져서 의식이 없어요' }]), 1);

console.log('safety 검사 통과');

// 음성 안내와 경증 판단: 위급하면 119를 말하고, 확실하지 않으면 응급실이 필요 없다고 말하지 않는다
const said = (r) => spokenSummary({ confidence: 0.9, call119: false, ...r });
if (!said({ finalLevel: 1, call119: true }).includes('119에 전화')) throw new Error('위급한데 119를 말하지 않음');
if (said({ finalLevel: 4, call119: true }).includes('아니어도')) throw new Error('119 권고인데 경증 안내');
if (!said({ finalLevel: 5 }).includes('아니어도')) throw new Error('경증 안내 누락');
if (said({ finalLevel: 5, confidence: 0.5 }).includes('아니어도')) throw new Error('확실하지 않은데 경증 안내');
if (isMild({ finalLevel: 3, call119: false, confidence: 0.9 })) throw new Error('KTAS 3을 경증으로 판단');
if (firstSentence('체온은 38.5도입니다. 그 다음 문장.') !== '체온은 38.5도입니다.') throw new Error('첫 문장 자르기 실패');
if (firstSentence('마침표가 없는 문장') !== '마침표가 없는 문장') throw new Error('마침표 없는 문장 처리 실패');
console.log('음성 안내 검사 통과');

// 호흡곤란 표현: 조사가 붙거나 띄어 써도 잡는다. 음성 질문에 "네"로 답해도 잡고, "아니요"는 잡지 않는다
for (const text of ['숨쉬기가 힘들어요', '숨 쉬기가 너무 힘들어요', '숨쉬기 어려워요', '호흡이 힘들어요', '호흡하기가 어려워요', '호흡곤란이 있어요']) {
  if (safetyFloor(text).floor !== 2) throw new Error(`호흡곤란을 놓침: ${text}`);
}
const answered = (text) => safetyFloor(safetyText([{ text, question: '숨쉬기가 힘든가요?' }])).floor;
if (answered('네') !== 2) throw new Error('"네"를 위급으로 보지 않음');
if (answered('잘 모르겠어요') !== 2) throw new Error('모호한 답은 위급 쪽으로 봐야 함');
if (answered('아니요') !== null) throw new Error('"아니요"를 위급으로 봄');
console.log('호흡곤란 표현 검사 통과');

// 몸 그림 문장: 받침에 맞는 조사, 아이 표시
const painCases = [
  [[['가슴'], false], '가슴이 아파요'],
  [[['머리'], false], '머리가 아파요'],
  [[['윗배', '왼쪽 팔'], false], '윗배, 왼쪽 팔이 아파요'],
  [[['허리'], true], '아이가 허리가 아파요'],
  [[['온몸'], false], '온몸이 아파요'],
  [[[], true], ''],
  // 통증 느낌·점수·시작 시점을 고르면 이어 붙인다 (KTAS 통증 구간을 그대로 쓴다)
  [[['가슴'], false, { feel: '쥐어짜는 듯', score: '8~10', since: '방금' }], '가슴이 쥐어짜듯이 아파요. 통증은 10점 중 8~10점이에요. 방금 시작됐어요'],
  [[['오른쪽 아랫배'], true, { since: '몇 시간 전부터' }], '아이가 오른쪽 아랫배가 아파요. 몇 시간 전부터 그래요'],
];
for (const [[parts, child, pain], expected] of painCases) {
  const got = painSentence(parts, child, pain);
  if (got !== expected) throw new Error(`몸 그림 문장 오류: ${got} (기대: ${expected})`);
}
console.log('몸 그림 문장 검사 통과');
