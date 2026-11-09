import { PhoneIcon } from '../components/icons.jsx';
import IncidentMap from './IncidentMap.jsx';
import { T, cancelIncident, remaining, reportIncident, useIncident } from './incident.js';

/** 진행 단계 한 줄. done: 끝남, now: 진행 중 */
function Stage({ state, title, detail }) {
  return (
    <li className={`stage ${state}`}>
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </li>
  );
}

/**
 * 시민 화면의 자동 신고 (시연). 10초 안에 취소하지 않으면 신고하고, 그 뒤로 출동·병원 수용·이송을 보여 준다.
 * 진짜 119 전화는 언제나 아래에 남겨 둔다
 */
export default function AutoReport() {
  const inc = useIncident();
  if (!inc) return null;
  const { phase } = inc;
  const order = ['reported', 'toScene', 'onsite', 'trans', 'arrived'];
  const at = order.indexOf(phase);
  const state = (i) => (at > i ? 'done' : at === i ? 'now' : '');
  const chosen = inc.hospitals.find((h) => h.id === inc.chosen);
  const asked = inc.hospitals.filter((h) => h.status !== 'withdrawn');
  const left = Math.max(0, Math.ceil(T.countdown - (inc.now - inc.phaseAt) / 1000));

  return (
    <section className="auto-report" aria-label="119 자동 신고 (시연)">
      <span className="badge sim">시연 · 실제로 신고되지 않아요</span>

      {phase === 'countdown' && (
        <div role="alert">
          <p className="headline">{left}초 뒤 119에 자동 신고해요</p>
          <p className="lead">위치, 증상, 앱 판정을 119 종합상황실에 함께 보냅니다.</p>
          <div className="countdown" style={{ '--sec': `${T.countdown}s` }} />
          <div className="report-actions">
            <button type="button" className="action call-action" onClick={() => reportIncident('시민이 바로 신고')}>
              지금 신고
            </button>
            <button type="button" className="ghost" onClick={cancelIncident}>
              취소
            </button>
          </div>
        </div>
      )}

      {phase === 'cancelled' && (
        <div>
          <p className="headline">자동 신고를 취소했어요</p>
          <p className="lead">증상이 나빠지거나 걱정되면 바로 신고하세요.</p>
          <button type="button" className="action call-action" onClick={() => reportIncident('시민이 직접 신고')}>
            신고하기
          </button>
        </div>
      )}

      {at >= 0 && (
        <>
          <p className="headline">{phase === 'arrived' ? '병원에 도착했어요' : '119에 신고했어요'}</p>
          <ol className="stages">
            <Stage state="done" title="신고 접수" detail={`접수번호 ${inc.id}`} />
            <Stage state={state(1) || (at === 0 ? 'now' : '')} title="구급차 출동" detail={at <= 1 ? `도착까지 약 ${remaining(inc, 'scene')}분` : '현장 도착'} />
            <Stage
              state={chosen ? 'done' : 'now'}
              title="병원에 미리 연락"
              detail={chosen ? `${chosen.name}이(가) 받기로 했어요` : asked.length ? `${asked.length}곳에 환자 정보를 보내고 답을 기다려요` : '받을 수 있는 응급실을 찾는 중'}
            />
            <Stage state={state(2)} title="현장 응급처치" />
            <Stage state={state(3)} title="병원으로 이송" detail={chosen && at <= 3 ? `병원까지 약 ${remaining(inc, 'hospital')}분` : null} />
            <Stage state={phase === 'arrived' ? 'done' : ''} title="병원 도착" />
          </ol>
          {phase !== 'arrived' && <p className="hint">구급차가 오는 동안 환자 곁에 있고, 현관문을 열어 두세요. 상황실에서 전화가 오면 받아 주세요.</p>}
          <IncidentMap inc={inc} />
          <p className="hint">시연이라 실제보다 빨리 진행돼요. 시간은 거리로 어림한 값이에요.</p>
        </>
      )}

      <a className="real-call" href="tel:119">
        <PhoneIcon size={18} />
        실제 응급이면 직접 119에 전화하세요
      </a>
    </section>
  );
}
