// 시연 모드(주소 뒤 ?demo)에서만 쓰는 119 자동 신고와 병원 수용 요청 흉내.
// 실제로는 어디에도 신고하거나 연락하지 않는다. 위치·주소·병원·병상과 AI가 고른 병원은 진짜 데이터다.
import { useSyncExternalStore } from 'react';
import { requestAddress, requestPlan } from '../api.js';
import { planSummary } from '../lib/triage/spoken.js';
import { getPosition, WONJU } from '../position.js';

export const DEMO = new URLSearchParams(location.search).has('demo');

// 시연이라 실제보다 빨리 진행한다 (초). 화면의 "약 n분"은 거리로 따로 계산한 실제 예상 시간이다
export const T = { countdown: 10, dispatch: 2, scene: 20, onsite: 8, trans: 20 };
const SCENE_KM = 1.3; // 구급차 출발점까지 거리. 실제 119안전센터 위치가 아니라 환자 북서쪽의 임의 지점
const STATION = { lat: 0.0083, lon: -0.0104 };
const BATCH = 3; // 한 번에 수용을 묻는 병원 수

let inc = null;
let timer = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const update = (patch) => {
  inc = { ...inc, ...patch };
  emit();
};
const log = (who, text) => update({ log: [...inc.log, { at: Date.now(), who, text }] });
const setPhase = (phase) => update({ phase, phaseAt: Date.now() });
const hospital = (id) => inc.hospitals.find((h) => h.id === id);

/** 지금 신고 상태. 없으면 null */
export const useIncident = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => inc,
  );

/** 실제 걸릴 시간(분): 도심 구급차 시속으로 어림한다 */
const minutes = (km, kmh) => Math.max(3, Math.round((km / kmh) * 60));

/** 남은 시간(분). 시연 진행률만큼 실제 예상 시간을 줄여서 보여 준다 */
export function remaining(i, kind) {
  const left = (sec) => Math.max(0, 1 - (i.now - i.phaseAt) / 1000 / sec);
  const scene = minutes(SCENE_KM, 30);
  const chosen = i.chosen && i.hospitals.find((h) => h.id === i.chosen);
  const trans = chosen ? minutes(chosen.km, 40) : null;
  if (kind === 'scene') {
    if (i.phase === 'reported') return scene;
    return i.phase === 'toScene' ? Math.ceil(scene * left(T.scene)) : 0;
  }
  if (!trans) return null;
  if (i.phase === 'trans') return Math.ceil(trans * left(T.trans));
  if (i.phase === 'arrived') return 0;
  return (kind === 'hospital' ? remaining(i, 'scene') : 0) + trans;
}

/** 지도에 그릴 구급차 위치 */
export function ambulanceAt(i) {
  const lerp = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
  const t = (sec) => Math.min(1, (i.now - i.phaseAt) / 1000 / sec);
  const chosen = i.hospitals.find((h) => h.id === i.chosen);
  if (!i.place) return null; // 바로 신고를 눌러 위치가 아직 없을 때
  if (i.phase === 'reported') return i.station;
  if (i.phase === 'toScene') return lerp(i.station, i.place, t(T.scene));
  if (i.phase === 'trans') return lerp(i.place, chosen, t(T.trans));
  if (i.phase === 'arrived') return chosen;
  return i.phase === 'onsite' ? i.place : null;
}

/** 위급 판정이 나오면 자동 신고 카운트다운을 시작한다. 진행 중인 신고가 있으면 그대로 둔다 */
export function startIncident(result, reported) {
  if (inc && inc.phase !== 'cancelled') return;
  const now = Date.now();
  inc = { id: `2611-${String(now).slice(-4)}`, result, reported, phase: 'countdown', phaseAt: now, now, log: [], hospitals: [], queue: [], chosen: null, place: null };
  log('시민', `앱 판정 KTAS ${result.finalLevel} · ${T.countdown}초 뒤 자동 신고 예정`);
  locate(inc.id);
  clearInterval(timer);
  timer = setInterval(tick, 500);
}

/** 위치·주소와 수용을 물을 병원 후보를 준비한다 (카운트다운 동안 미리) */
async function locate(id) {
  const pos = await getPosition();
  if (inc?.id !== id) return;
  const place = pos ?? { ...WONJU, fallback: true };
  update({ place, station: { lat: place.lat + STATION.lat, lon: place.lon + STATION.lon } });
  requestAddress(place.lat, place.lon)
    .then(({ address }) => inc?.id === id && update({ place: { ...inc.place, address } }))
    .catch(() => {});
  const r = inc.result;
  try {
    // 응급실 3곳은 AI가 실시간 병상·검사·진료 제한을 보고 고른다. 나머지는 병상·거리 순으로 다음에 묻는다
    const plan = await requestPlan({ lat: place.lat, lon: place.lon, mode: 'er', patient: planSummary(r), pediatric: r.symptom.population === '소아', department: r.suggested_department });
    if (inc?.id !== id) return;
    update({ by: plan.by, queue: [...plan.steps.map((s) => ({ ...s.place, why: s.reason })), ...plan.others] });
    if (plan.crowd) log('119', plan.crowd === 'full' ? '근처 응급실이 모두 병상 여유 없음' : '가까운 응급실이 모두 꽉 차 범위를 넓혀 찾음');
  } catch (e) {
    if (inc?.id === id) log('119', `병원 정보를 불러오지 못함: ${e.message}`);
  }
}

export function cancelIncident() {
  if (inc?.phase !== 'countdown') return;
  setPhase('cancelled');
  log('시민', '자동 신고를 취소함');
}

/** 신고 접수. 카운트다운이 끝나거나 시민이 바로 누르면 */
export function reportIncident(how) {
  if (inc?.phase !== 'countdown' && inc?.phase !== 'cancelled') return;
  update({ reportedAt: Date.now(), how });
  setPhase('reported');
  log('시민', how);
  log('119', `신고 접수 (접수번호 ${inc.id}), 위치·증상·앱 판정 수신`);
}

/** 병원 응답. 병원 화면에서 누르거나, 시간이 되면 병상 정보로 자동 응답한다 */
export function respondHospital(id, accept, reason = '응급실 병상 부족') {
  const h = hospital(id);
  if (!h || h.status !== 'waiting') return;
  const hospitals = inc.hospitals.map((x) => (x.id === id ? { ...x, status: accept ? 'accepted' : 'rejected', reason: accept ? null : reason } : x));
  update({ hospitals });
  log('병원', `${h.name}: ${accept ? '수용 가능' : `수용 불가 (${reason})`}`);
  if (accept && !inc.chosen) {
    // 먼저 받겠다고 한 곳으로 정하고, 아직 답이 없는 곳의 요청은 거둔다
    update({ chosen: id, hospitals: inc.hospitals.map((x) => (x.status === 'waiting' ? { ...x, status: 'withdrawn' } : x)) });
    log('119', `이송 병원 결정: ${h.name}`);
  }
}

function notifyNext() {
  const now = Date.now();
  const batch = inc.queue.slice(0, BATCH).map((h, i) => ({
    ...h,
    status: 'waiting',
    // 병상이 0 이하(음수는 정원 초과)면 거절, 나머지는 수용. 병상 정보가 없는 곳은 확인하느라 조금 늦게 답한다
    auto: h.erBeds == null || h.erBeds > 0,
    replyAt: now + (3 + i * 2 + (h.erBeds == null ? 2 : 0)) * 1000,
  }));
  update({ queue: inc.queue.slice(BATCH), hospitals: [...inc.hospitals, ...batch] });
  log('119', `${batch.map((h) => h.name).join(', ')}에 환자 정보를 보내 수용 여부를 물음`);
}

function tick() {
  if (!inc) return clearInterval(timer);
  const now = Date.now();
  const since = (now - inc.phaseAt) / 1000;
  const { phase } = inc;

  if (phase === 'countdown' && since >= T.countdown) reportIncident(`앱 자동 신고 (${T.countdown}초 동안 취소하지 않음)`);
  else if (phase === 'reported' && since >= T.dispatch) {
    setPhase('toScene');
    log('119', '구급차 출동');
  } else if (phase === 'toScene' && since >= T.scene) {
    setPhase('onsite');
    log('119', '구급대 현장 도착, 응급처치 시작');
  } else if (phase === 'onsite' && since >= T.onsite && inc.chosen) {
    setPhase('trans');
    log('119', `${hospital(inc.chosen).name}(으)로 이송 시작`);
  } else if (phase === 'trans' && since >= T.trans) {
    setPhase('arrived');
    log('병원', `${hospital(inc.chosen).name} 도착, 환자 인계`);
    clearInterval(timer);
  }

  if (inc.reportedAt && !inc.chosen) {
    for (const h of inc.hospitals) if (h.status === 'waiting' && now >= h.replyAt) respondHospital(h.id, h.auto);
    const open = inc.hospitals.some((h) => h.status === 'waiting');
    if (!open && !inc.chosen && inc.queue.length) notifyNext();
    else if (!open && !inc.chosen && inc.hospitals.length && !inc.searching) {
      update({ searching: true });
      log('119', '수용 가능한 병원을 찾지 못해 상황실이 직접 연락하는 중');
    }
  }
  update({ now });
}

export function resetIncident() {
  clearInterval(timer);
  inc = null;
  emit();
}
