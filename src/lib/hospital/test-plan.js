import assert from 'node:assert/strict';
import { pickPlaces, rankByRule } from './plan.js';

const er = (id, km, erBeds) => ({ id, name: id, km, erBeds, ct: 'Y', notices: [] });
const list = rankByRule([er('FULL', 0.5, 0), er('UNKNOWN', 0.8, null), er('FAR_OK', 9, 4), er('NEAR_OK', 2, 10)]);

// 병상이 남은 곳 → 정보 없음 → 여유 없음, 같은 묶음 안에서는 가까운 순
assert.deepEqual(list.map((h) => h.id), ['NEAR_OK', 'FAR_OK', 'UNKNOWN', 'FULL']);

// AI가 고른 순서를 따르되, 후보에 없는 id와 중복은 버리고 정한 수까지만
const ai = await pickPlaces('er', list, '시험', 2, async () => ({
  json: { picks: [{ id: 'FAR_OK', reason: '이유1' }, { id: 'GHOST', reason: '없는 병원' }, { id: 'FAR_OK', reason: '중복' }, { id: 'NEAR_OK', reason: '이유2' }, { id: 'UNKNOWN', reason: '넘침' }] },
}));
assert.equal(ai.by, 'ai');
assert.deepEqual(ai.picks.map((p) => [p.place.id, p.reason]), [['FAR_OK', '이유1'], ['NEAR_OK', '이유2']]);

// AI가 실패하거나 쓸 수 있는 id가 없으면 규칙 순서와 기본 설명으로 대신한다
const failed = await pickPlaces('er', list, '시험', 3, async () => {
  throw new Error('시험용 실패');
});
assert.equal(failed.by, 'rule');
assert.deepEqual(failed.picks.map((p) => p.reason), ['2km, 응급실 병상 10개', '9km, 응급실 병상 4개', '0.8km, 병상 정보 없음']);
const empty = await pickPlaces('er', list, '시험', 3, async () => ({ json: { picks: [{ id: 'GHOST', reason: '없음' }] } }));
assert.equal(empty.by, 'rule');

console.log('plan 검사 통과');
