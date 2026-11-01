import { useState } from 'react';
import { requestHospitals } from '../api.js';
import { fallbackIfNoApp, naverDirections } from '../lib/hospital/directions.js';
import { getPosition, WONJU } from '../position.js';

function bedsLabel(n) {
  if (n == null) return '정보 없음';
  return n > 0 ? `${n}개` : '여유 없음';
}

/** YYYYMMDDHHmmss → HH:mm */
const timeLabel = (s) => (s && s.length >= 12 ? `${s.slice(8, 10)}:${s.slice(10, 12)} 기준` : '');

export function DirectionsLink({ h, pos }) {
  const { href, newTab, fallback } = naverDirections(h, pos);
  return (
    <a href={href} target={newTab ? '_blank' : undefined} rel="noreferrer" onClick={fallback ? () => fallbackIfNoApp(fallback) : undefined}>
      길찾기
    </a>
  );
}

/**
 * 가까운 응급실 목록: 실시간 가용병상, 길찾기(네이버 지도), 응급실 전화
 * @param {{urgent: boolean, pediatric: boolean, primary: boolean}} props urgent: KTAS 1~2 (직접 이동보다 119 우선), pediatric: 소아 판정, primary: 이 화면의 주된 행동인가
 */
export default function HospitalList({ urgent, pediatric, primary }) {
  const [state, setState] = useState({ status: 'idle' });

  async function load() {
    // 새로고침 중에는 보던 목록을 그대로 둔다
    setState((s) => (s.status === 'done' ? { ...s, refreshing: true, refreshError: null } : { status: 'loading' }));
    const pos = await getPosition();
    const { lat, lon } = pos ?? WONJU;
    try {
      const { hospitals } = await requestHospitals(lat, lon);
      const checkedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      setState({ status: 'done', hospitals, pos, checkedAt });
    } catch (e) {
      setState((s) => (s.status === 'done' ? { ...s, refreshing: false, refreshError: e.message } : { status: 'error', message: e.message }));
    }
  }

  if (state.status === 'idle' || state.status === 'error') {
    return (
      <div className="hospitals">
        <button type="button" className={primary ? 'action' : 'ghost'} onClick={load}>
          {state.status === 'error' ? '다시 시도' : '가까운 응급실 찾기'}
        </button>
        {state.status === 'error' && <p className="note warn">{state.message}</p>}
      </div>
    );
  }
  if (state.status === 'loading') {
    return <p className="hospitals typing">위치와 응급실 병상을 확인하는 중입니다…</p>;
  }

  return (
    <div className="hospitals">
      <div className="hospitals-head">
        <div>
          <p className="followups-title">가까운 응급실</p>
          <p className="hint">{state.checkedAt}에 불러온 정보입니다</p>
        </div>
        <button type="button" className="ghost" onClick={load} disabled={state.refreshing}>
          {state.refreshing ? '확인 중…' : '새로고침'}
        </button>
      </div>
      {state.refreshError && <p className="note warn">{state.refreshError} 아래는 이전 정보입니다.</p>}
      {urgent && <p className="note warn">위급한 상황에서는 직접 이동하지 말고 119 구급대의 안내를 따르세요.</p>}
      {!state.pos && <p className="hint">위치를 받지 못해 원주시청 기준으로 보여 드립니다.</p>}
      {state.hospitals.length === 0 && <p className="hint">주변 응급실 정보를 찾지 못했습니다.</p>}
      <ul>
        {state.hospitals.map((h) => (
          <li key={h.id} className="hospital">
            <div className="hospital-head">
              <strong>{h.name}</strong>
              <span className="hint">{h.km}km</span>
            </div>
            <div className="hint">
              응급실 병상 {bedsLabel(h.erBeds)}
              {pediatric && ` · 소아 병상 ${bedsLabel(h.pedBeds)}`}
              {h.ct === 'Y' && ' · CT'}
              {h.mri === 'Y' && ' · MRI'}
              {h.angio === 'Y' && ' · 혈관조영'}
              {h.updatedAt && ` · ${timeLabel(h.updatedAt)}`}
            </div>
            {h.notices === null && <p className="hint">진료 제한 정보를 확인하지 못했습니다. 전화로 확인해 주세요.</p>}
            {h.notices?.length > 0 && (
              <details className="notices" open={h.notices.length <= 3}>
                <summary>진료 제한 안내 {h.notices.length}건</summary>
                <ul>
                  {h.notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="hospital-actions">
              <DirectionsLink h={h} pos={state.pos} />
              {h.tel && <a href={`tel:${h.tel}`}>전화 {h.tel}</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
