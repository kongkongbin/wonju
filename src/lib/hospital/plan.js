import { z } from 'zod';
import { generateJson } from '../llm/claude.js';
import { nearbyHospitals, openClinics } from './nearby.js';

// 판정 뒤 "지금 이렇게 하세요" 1·2·3. 위급(KTAS 1~2)은 119가 먼저라 응급실은 참고로만 보여 주고 AI를 부르지 않는다

const CACHE_MS = 60_000;
const cache = new Map();

/** 같은 곳(약 100m)에서 1분 안에 다시 물으면 공공데이터를 다시 부르지 않는다 (개발계정 하루 1,000회 한도) */
async function remember(key, load) {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
  if (cache.has(key)) return cache.get(key).value;
  const value = await load();
  cache.set(key, { at: now, value });
  return value;
}

const bedsText = (h) => (h.erBeds > 0 ? `응급실 병상 ${h.erBeds}개` : h.erBeds == null ? '병상 정보 없음' : '병상 여유 없음');
const clock = (s) => (s ? `${s.slice(0, 2)}:${s.slice(2)}` : '?');
const exams = (h) => [h.ct === 'Y' && 'CT', h.mri === 'Y' && 'MRI', h.angio === 'Y' && '혈관조영'].filter(Boolean).join(', ') || '정보 없음';

const erReason = (h) => `${h.km}km, ${bedsText(h)}`;
const clinicReason = (c) => `${c.km}km, 오늘 ${clock(c.opens)}~${clock(c.closes)} 진료`;
const erLine = (h) =>
  `- id: ${h.id} | ${h.name} | ${h.km}km | ${bedsText(h)} | 검사: ${exams(h)} | 진료 제한: ${h.notices === null ? '확인 실패' : h.notices.join(' / ') || '없음'}`;
const clinicLine = (c) => `- id: ${c.id} | ${c.name} (${c.kind}) | ${c.km}km | 진료과: ${c.departments.join(', ')} | 오늘 ${clock(c.opens)}~${clock(c.closes)}`;

/** 병상이 남은 곳 → 정보 없는 곳 → 여유 없는 곳 순, 같은 묶음 안에서는 가까운 순 */
export function rankByRule(hospitals) {
  const group = (h) => (h.erBeds > 0 ? 0 : h.erBeds == null ? 1 : 2);
  return [...hospitals].sort((a, b) => group(a) - group(b) || a.km - b.km);
}

/** 병상 수를 알고 0 이하인 곳. 음수는 정원을 넘겨 받고 있다는 뜻이다 */
const isFull = (h) => h.erBeds != null && h.erBeds <= 0;
const WIDE = 10; // 가까운 5곳이 모두 꽉 차면 이만큼 넓혀 찾는다

/**
 * 가까운 응급실 후보. 모두 꽉 찼으면 범위를 넓히고, 넓혀도 꽉 찼으면 crowd: 'full'로 알린다
 * @returns {Promise<{hospitals: object[], crowd?: 'widened'|'full'}>} widened: 넓혀서 병상이 있거나 정보 없는 곳을 찾음
 */
export async function erCandidates(lat, lon, spot, load = nearbyHospitals) {
  const near = await remember(`er:${spot}`, () => load(lat, lon));
  if (!near.length || !near.every(isFull)) return { hospitals: rankByRule(near) };
  const wide = await remember(`er-wide:${spot}`, () => load(lat, lon, WIDE));
  return { hospitals: rankByRule(wide), crowd: wide.every(isFull) ? 'full' : 'widened' };
}

const SYSTEM = `너는 KTAS 판정을 받은 환자에게 지금 갈 곳을 골라 주는 보조 도구다.

규칙:
1. 후보 목록 안에서만 고른다. 후보에 없는 정보를 지어내지 않는다.
2. 환자 증상과 맞지 않는 진료 제한이 있는 곳(예: 뇌졸중 의심인데 신경외과 진료 불가)은 뒤로 보낸다.
3. 응급실은 병상이 남은 곳, 증상에 필요한 검사가 되는 곳, 가까운 곳을 앞에 둔다. 병·의원은 증상에 맞는 진료과가 있고 가까운 곳을 앞에 둔다.
4. 좋은 순서로 고르고, reason에는 고른 이유를 후보 정보에 근거해 짧은 한 문장으로 쓴다 (예: "가장 가깝고 응급실 병상이 22개 남았습니다").
5. 한국어로 쓴다.`;

const PickSchema = z.object({ picks: z.array(z.object({ id: z.string(), reason: z.string() })).max(5) });

/**
 * 후보 중 갈 곳을 AI가 고르고 이유를 붙인다. 후보에 없는 id는 버리고, 실패하면 규칙 순서와 기본 설명으로 대신한다
 * @param {'er'|'clinic'} type
 * @param {object[]} candidates 규칙 순서로 정렬된 후보
 * @param {string} patient 판정 요약
 * @param {number} count 고를 수
 * @param {typeof generateJson} [ask] 시험용으로 바꿔 끼운다
 * @returns {Promise<{picks: {place: object, reason: string}[], by: 'ai'|'rule'}>}
 */
export async function pickPlaces(type, candidates, patient, count, ask = generateJson) {
  const reasonOf = type === 'clinic' ? clinicReason : erReason;
  const byRule = { picks: candidates.slice(0, count).map((place) => ({ place, reason: reasonOf(place) })), by: 'rule' };
  if (candidates.length === 0) return byRule;
  try {
    const { json } = await ask({
      system: SYSTEM,
      user: `## 환자\n${patient}\n\n## 후보 (${type === 'clinic' ? '지금 진료 중인 병·의원' : '응급실'})\n${candidates.map(type === 'clinic' ? clinicLine : erLine).join('\n')}\n\n최대 ${count}곳을 고른다.`,
      schema: PickSchema,
    });
    const picks = [];
    for (const { id, reason } of json.picks) {
      const place = candidates.find((c) => c.id === id);
      if (place && !picks.some((p) => p.place === place)) picks.push({ place, reason });
    }
    return picks.length ? { picks: picks.slice(0, count), by: 'ai' } : byRule;
  } catch (e) {
    console.error('[plan] AI 선택 실패, 규칙 순서 사용:', e.message);
    return byRule;
  }
}

const notIn = (steps) => (p) => !steps.some((s) => s.place.id === p.id);

/**
 * @param {{mode: 'urgent'|'er'|'mild', lat: number, lon: number, patient: string, pediatric: boolean, department: string}} req
 *   mode: urgent는 KTAS 1~2·119 권고, mild는 경증 안내, er은 그 밖 / patient: 판정 요약
 * @returns {Promise<{steps: {type: 'er'|'clinic', place: object, reason: string, later?: boolean}[], others: object[], by: 'ai'|'rule', note?: string, crowd?: 'widened'|'full'}>}
 *   later: 지금이 아니라 증상이 나빠지면 갈 곳, others: 지도에만 보여 줄 나머지, crowd: erCandidates 참고
 */
export async function makePlan({ mode, lat, lon, patient, pediatric, department }) {
  const spot = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const { hospitals, crowd } = await erCandidates(lat, lon, spot);

  if (mode === 'urgent') {
    const steps = hospitals.slice(0, 3).map((place) => ({ type: 'er', place, reason: erReason(place) }));
    return { steps, others: hospitals.filter(notIn(steps)), by: 'rule', crowd };
  }

  let note;
  if (mode === 'mild') {
    const clinics = await remember(`clinic:${spot}:${pediatric}:${department}`, () => openClinics(lat, lon, { pediatric, department })).catch((e) => {
      console.error('[plan] 병·의원 조회 실패:', e.message);
      return null;
    });
    if (clinics?.length) {
      const { picks, by } = await pickPlaces('clinic', clinics, patient, 2);
      const er = hospitals[0];
      const steps = [
        ...picks.map((p) => ({ type: 'clinic', ...p })),
        ...(er ? [{ type: 'er', place: er, reason: `증상이 나빠지면: ${erReason(er)}`, later: true }] : []),
      ];
      return { steps, others: [...clinics, ...hospitals].filter(notIn(steps)), by, crowd };
    }
    note = clinics ? '지금 진료 중인 병·의원을 근처에서 찾지 못해 응급실을 보여 드립니다.' : '병·의원 정보를 불러오지 못해 응급실을 보여 드립니다.';
  }

  const { picks, by } = await pickPlaces('er', hospitals, patient, 3);
  const steps = picks.map((p) => ({ type: 'er', ...p }));
  return { steps, others: hospitals.filter(notIn(steps)), by, note, crowd };
}
