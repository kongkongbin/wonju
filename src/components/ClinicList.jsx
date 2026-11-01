import { useState } from 'react';
import { requestClinics } from '../api.js';
import { getPosition, WONJU } from '../position.js';
import { DirectionsLink } from './HospitalList.jsx';

/** HHmm → HH:mm */
const clock = (s) => `${s.slice(0, 2)}:${s.slice(2)}`;

/**
 * 지금 진료 중인 가까운 병·의원 목록 (KTAS 4~5 안내)
 * @param {{pediatric: boolean, department: string}} props department: 판정이 추천한 진료과
 */
export default function ClinicList({ pediatric, department }) {
  const [state, setState] = useState({ status: 'idle' });

  async function load() {
    setState({ status: 'loading' });
    const pos = await getPosition();
    const { lat, lon } = pos ?? WONJU;
    try {
      const { clinics } = await requestClinics(lat, lon, pediatric, department);
      setState({ status: 'done', clinics, pos });
    } catch (e) {
      setState({ status: 'error', message: e.message });
    }
  }

  if (state.status === 'idle' || state.status === 'error') {
    return (
      <div className="hospitals clinics">
        <button type="button" className="ghost" onClick={load}>
          {state.status === 'error' ? '다시 시도' : '지금 진료 중인 병원 찾기'}
        </button>
        {state.status === 'error' && <p className="note warn">{state.message}</p>}
      </div>
    );
  }
  if (state.status === 'loading') {
    return <p className="hospitals clinics typing">지금 진료 중인 병원을 찾는 중입니다…</p>;
  }

  return (
    <div className="hospitals clinics">
      <p className="followups-title">지금 진료 중인 병·의원{pediatric && ' (소아청소년과)'}</p>
      {!state.pos && <p className="hint">위치를 받지 못해 원주시청 기준으로 보여 드립니다.</p>}
      {state.clinics.length === 0 ? (
        <p className="hint">가까운 곳에서 찾지 못했습니다. 진료가 급하면 아래 응급실을 이용하세요.</p>
      ) : (
        <p className="hint">진료 시간은 바뀔 수 있으니 가기 전에 전화로 확인하세요.</p>
      )}
      <ul>
        {state.clinics.map((c) => (
          <li key={c.id} className="hospital">
            <div className="hospital-head">
              <strong>{c.name}</strong>
              <span className="hint">{c.km}km</span>
            </div>
            <div className="hint">
              {c.kind} · 오늘 {clock(c.opens)}~{clock(c.closes)}
            </div>
            <div className="hint">진료과목: {c.departments.join(', ')}</div>
            <div className="hospital-actions">
              <DirectionsLink h={c} pos={state.pos} />
              {c.tel && <a href={`tel:${c.tel}`}>전화 {c.tel}</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
