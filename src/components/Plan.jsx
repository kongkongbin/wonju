import { useEffect, useRef, useState } from 'react';
import { requestPlan } from '../api.js';
import { getPosition, WONJU } from '../position.js';
import { Beds, DirectionsLink } from './HospitalList.jsx';
import { PhoneIcon } from './icons.jsx';
import PlanMap from './PlanMap.jsx';

function Notices({ notices }) {
  if (notices === null) return <p className="hint">진료 제한 정보를 확인하지 못했습니다. 전화로 확인해 주세요.</p>;
  if (!notices?.length) return null;
  return (
    <details className="notices">
      <summary>진료 제한 안내 {notices.length}건</summary>
      <ul>
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  );
}

// 가까운 응급실이 모두 병상 여유가 없을 때 (서버 erCandidates)
const CROWD = {
  widened: '가까운 응급실이 모두 병상 여유가 없어 더 먼 곳까지 찾았습니다.',
  full: '근처 응급실이 모두 병상 여유가 없습니다. 가기 전에 꼭 전화로 확인하고, 상태가 나쁘면 119에 연락하세요. 구급대가 받을 수 있는 병원을 찾아 줍니다.',
};

/**
 * 판정 뒤 갈 곳 1·2·3을 위치와 실시간 병상으로 골라 지도와 함께 보여 준다. 판정이 나오면 바로 위치를 묻는다.
 * urgent(KTAS 1~2·119 권고)는 119가 먼저라 가까운 응급실을 참고로만 보여 주고 길찾기는 두지 않는다
 * @param {{mode: 'urgent'|'er'|'mild', summary: string, pediatric: boolean, department: string}} props summary: AI에게 넘길 판정 요약
 */
export default function Plan({ mode, summary, pediatric, department }) {
  const [state, setState] = useState({ status: 'loading' });
  const started = useRef(false);

  async function load() {
    setState({ status: 'loading' });
    const pos = await getPosition();
    const { lat, lon } = pos ?? WONJU;
    try {
      const plan = await requestPlan({ lat, lon, mode, patient: summary, pediatric, department });
      setState({ status: 'done', plan, pos, center: { lat, lon }, picks: plan.steps.map((s) => s.place) });
    } catch (e) {
      setState({ status: 'error', message: e.message });
    }
  }

  useEffect(() => {
    if (started.current) return; // 개발 모드의 StrictMode가 두 번 불러도 한 번만 조회한다
    started.current = true;
    load();
  }, []);

  if (state.status === 'loading') {
    return <p className="plan typing">{mode === 'urgent' ? '가까운 응급실을 확인하는 중입니다…' : '위치와 실시간 병상으로 갈 곳을 고르는 중입니다…'}</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="plan">
        <p className="note warn">{state.message}</p>
        <button type="button" className="ghost" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  const { steps, others, by, note, crowd } = state.plan;
  const map = steps.length > 0 && <PlanMap center={state.center} picks={state.picks} others={others} />;
  const where = !state.pos && <p className="hint">위치를 받지 못해 원주시청 기준으로 보여 드립니다.</p>;
  const crowded = crowd && <p className="note warn">{CROWD[crowd]}</p>;

  if (mode === 'urgent') {
    return (
      <div className="plan">
        <p className="hint">직접 이동하지 말고 119 구급대의 안내를 따르세요. 구급대에 참고로 알려 줄 수 있는 가까운 응급실입니다.</p>
        {where}
        {crowded}
        {map}
        <ol className="plan-brief">
          {steps.map((s) => (
            <li key={s.place.id}>
              <strong>{s.place.name}</strong> <span className="hint">{s.reason}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <section className="plan" aria-label="지금 갈 곳">
      <div className="plan-head">
        <p className="followups-title">지금 이렇게 하세요</p>
        <span className={by === 'ai' ? 'badge ai' : 'badge'}>{by === 'ai' ? 'AI가 실시간 정보로 고름' : '병상·거리 순'}</span>
      </div>
      {where}
      {note && <p className="note warn">{note}</p>}
      {crowded}
      {steps.length === 0 && <p className="hint">주변 병원 정보를 찾지 못했습니다. 급하면 119에 연락하세요.</p>}
      {map}
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.place.id} className={s.later ? 'step later' : 'step'}>
            <div className="hospital-head">
              <strong>{s.place.name}</strong>
              <span className="hint">{s.type === 'clinic' ? s.place.kind : '응급실'}</span>
            </div>
            <p className="step-reason">{s.reason}</p>
            {s.type === 'er' && (
              <div className="beds-row">
                <Beds label="응급실" count={s.place.erBeds} />
                {pediatric && <Beds label="소아" count={s.place.pedBeds} />}
              </div>
            )}
            {s.type === 'er' && <Notices notices={s.place.notices} />}
            <div className="hospital-actions">
              <DirectionsLink h={s.place} pos={state.pos} />
              {s.place.tel && (
                <a href={`tel:${s.place.tel}`}>
                  <PhoneIcon size={18} />
                  전화
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="hint">병상과 진료 시간은 바뀔 수 있으니 가기 전에 전화로 확인하세요.</p>
    </section>
  );
}
