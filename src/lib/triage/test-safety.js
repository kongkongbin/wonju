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
