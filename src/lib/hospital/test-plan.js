import assert from 'node:assert/strict';
import { erCandidates, pickPlaces, rankByRule } from './plan.js';

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

// 가까운 응급실이 모두 꽉 찼을 때 (병상 0 이하, 음수는 정원 초과)
let asked = [];
const fake = (byLimit) => async (lat, lon, limit = 5) => {
  asked.push(limit);
  return byLimit[limit];
};
// 한 곳이라도 병상이 있거나 정보가 없으면 넓히지 않는다
let r = await erCandidates(0, 0, 't1', fake({ 5: [er('A', 1, -2), er('U', 3, null)] }));
assert.deepEqual(asked, [5]);
assert.equal(r.crowd, undefined);
// 모두 꽉 차면 10곳으로 넓히고, 병상이 남은 먼 곳을 맨 앞에 둔다
asked = [];
r = await erCandidates(0, 0, 't2', fake({ 5: [er('A', 1, -2), er('B', 2, 0)], 10: [er('A', 1, -2), er('B', 2, 0), er('FAR', 12, 5)] }));
assert.deepEqual(asked, [5, 10]);
assert.equal(r.crowd, 'widened');
assert.equal(r.hospitals[0].id, 'FAR');
// 넓혀도 모두 꽉 찼으면 full
r = await erCandidates(0, 0, 't3', fake({ 5: [er('A', 1, 0)], 10: [er('A', 1, 0), er('D', 9, -1)] }));
assert.equal(r.crowd, 'full');

console.log('plan 검사 통과');
