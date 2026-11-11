import { useState } from 'react';
import { Beds } from '../components/HospitalList.jsx';
import { LEVEL_LABEL, firstSentence } from '../lib/triage/spoken.js';
import IncidentMap from './IncidentMap.jsx';
import { remaining, respondHospital, useIncident } from './incident.js';

const TABS = [
  { key: 'citizen', label: '시민 앱', who: '시민' },
  { key: 'ops', label: '119 상황실', who: '119' },
  { key: 'er', label: '병원 응급실', who: '병원' },
];
const STATUS = { waiting: '답 기다림', accepted: '수용 가능', rejected: '수용 불가', withdrawn: '요청 취소' };
const clock = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false });

function Level({ result }) {
  const n = result.finalLevel;
  return (
    <span className={`level-chip level-${n}`}>
      KTAS {n} · {LEVEL_LABEL[n]}
    </span>
  );
}

function ambulanceText(inc) {
  const chosen = inc.hospitals.find((h) => h.id === inc.chosen);
  if (inc.phase === 'reported') return '출동 준비';
  if (inc.phase === 'toScene') return `현장으로 가는 중 · 약 ${remaining(inc, 'scene')}분`;
  if (inc.phase === 'onsite') return chosen ? '현장 응급처치 중' : '현장 응급처치 중 · 이송 병원을 기다림';
  if (inc.phase === 'trans') return `${chosen.name}(으)로 이송 중 · 약 ${remaining(inc, 'hospital')}분`;
  return `${chosen.name} 도착`;
}

/** 119 종합상황실: 앱 자동 신고를 받고 구급차와 병원 수배를 지켜본다 */
function OpsPanel({ inc }) {
  if (!inc?.reportedAt) {
    return (
      <section className="desk">
        <h2>119 종합상황실</h2>
        <p className="desk-empty">
          {inc?.phase === 'countdown' ? '시민 앱에서 자동 신고를 기다리는 중이에요.' : '들어온 신고가 없어요. 시민 앱에서 위급 판정이 나오면 10초 뒤 여기로 자동 신고돼요.'}
        </p>
      </section>
    );
  }
  const r = inc.result;
  return (
    <section className="desk">
      <h2>119 종합상황실</h2>
      <article className="desk-card">
        <div className="desk-head">
          <b>구급 · {inc.how}</b>
          <span className="hint">
            접수 {inc.id} · {clock(inc.reportedAt)}
          </span>
        </div>
        <dl className="facts">
          <dt>위치</dt>
          <dd>
            {!inc.place ? '확인 중' : inc.place.address ?? `위도 ${inc.place.lat.toFixed(5)}, 경도 ${inc.place.lon.toFixed(5)}`}
            {inc.place?.fallback && <div className="hint">위치 권한이 없어 원주시청으로 시연합니다</div>}
          </dd>
          <dt>환자</dt>
          <dd>{r.symptom.population}</dd>
          <dt>신고 내용</dt>
          <dd>{inc.reported.join(' / ')}</dd>
          <dt>앱 판정</dt>
          <dd>
            <Level result={r} /> {r.symptom.name} · 신뢰도 {Math.round(r.confidence * 100)}%
          </dd>
          <dt>판정 근거</dt>
          <dd>{firstSentence(r.level_reason)}</dd>
          <dt>구급차</dt>
          <dd>{ambulanceText(inc)}</dd>
        </dl>
      </article>

      <article className="desk-card">
        <div className="desk-head">
          <b>병원 수배</b>
          {inc.by === 'ai' && <span className="badge ai">AI가 실시간 정보로 고름</span>}
        </div>
        {inc.hospitals.length === 0 ? (
          <p className="hint">받을 수 있는 응급실을 고르는 중입니다…</p>
        ) : (
          <ul className="asks">
            {inc.hospitals.map((h) => (
              <li key={h.id} className={`ask ${h.status}`}>
                <b>{h.name}</b>
                <span className="ask-status">{h.id === inc.chosen ? '이송 결정' : STATUS[h.status]}</span>
                <span className="hint">
                  {h.km}km · <Beds label="응급실" count={h.erBeds} />
                </span>
                {h.why && <p className="hint">{h.why}</p>}
              </li>
            ))}
          </ul>
        )}
      </article>

      <IncidentMap inc={inc} />

      <article className="desk-card">
        <b>기록</b>
        <ol className="log">
          {[...inc.log].reverse().map((l, i) => (
            <li key={i}>
              <time>{clock(l.at)}</time>
              <b className="who">{l.who}</b> {l.text}
            </li>
          ))}
        </ol>
      </article>
    </section>
  );
}

/** 병원 응급실: 119가 보낸 환자 정보를 보고 받을지 답한다. 받기로 정해지면 도착 전에 준비한다 */
function ErRequest({ h, inc }) {
  const r = inc.result;
  const coming = h.id === inc.chosen;
  const eta = coming ? remaining(inc, 'hospital') : null;
  const head = (
    <div className="desk-head">
      <b>{h.name}</b>
      <span className="ask-status">{coming ? (inc.phase === 'arrived' ? '도착' : '환자 오는 중') : STATUS[h.status]}</span>
    </div>
  );
  // 끝난 요청은 한 줄로 줄인다
  if (h.status === 'rejected' || h.status === 'withdrawn') {
    return (
      <article className={`desk-card er-req ${h.status}`}>
        {head}
        <p className="hint">{h.status === 'rejected' ? `수용 불가로 답했어요 (${h.reason}).` : '다른 병원으로 이송이 정해져 요청이 취소됐어요.'}</p>
      </article>
    );
  }
  return (
    <article className={`desk-card er-req ${h.status}`}>
      {head}
      <dl className="facts">
        <dt>환자</dt>
        <dd>
          <Level result={r} /> {r.symptom.population} · {r.symptom.name}
        </dd>
        <dt>신고 내용</dt>
        <dd>{inc.reported.join(' / ')}</dd>
        <dt>판정 근거</dt>
        <dd>{firstSentence(r.level_reason)}</dd>
        <dt>필요 진료과</dt>
        <dd>{r.suggested_department}</dd>
        <dt>도착</dt>
        <dd>{eta == null ? `이송 병원 결정 전 · ${h.km}km` : eta === 0 ? '도착' : `약 ${eta}분 뒤`}</dd>
      </dl>
      {h.status === 'waiting' && (
        <>
          <div className="report-actions">
            <button type="button" className="action" onClick={() => respondHospital(h.id, true)}>
              수용
            </button>
            <button type="button" className="ghost" onClick={() => respondHospital(h.id, false, '병상·인력 부족')}>
              거절
            </button>
          </div>
          <p className="hint">답하지 않으면 실시간 병상 정보로 자동 응답해요 (병상 0개 이하면 거절).</p>
        </>
      )}
      {coming && inc.phase !== 'arrived' && (
        <p className="prep">
          준비 요청: {r.suggested_department} 진료와 KTAS {r.finalLevel} 환자를 받을 자리를 준비해 주세요.
        </p>
      )}
    </article>
  );
}

function ErPanel({ inc }) {
  const list = inc?.hospitals ?? [];
  const sorted = [...list].sort((a, b) => (b.id === inc.chosen) - (a.id === inc.chosen));
  return (
    <section className="desk">
      <h2>병원 응급실</h2>
      {list.length === 0 ? (
        <p className="desk-empty">119가 환자 정보를 보내 수용을 물으면 여기에 보여요.</p>
      ) : (
        sorted.map((h) => <ErRequest key={h.id} h={h} inc={inc} />)
      )}
    </section>
  );
}

/**
 * 시연 모드 화면: 시민 앱, 119 상황실, 병원 응급실. 폰에서는 탭으로 바꾸고, 넓은 화면에서는 세 칸을 나란히 둔다
 * @param {{children: import('react').ReactNode}} props 시민 앱 화면
 */
export default function DemoShell({ children }) {
  const inc = useIncident();
  const [tab, setTab] = useState('citizen');
  const [seen, setSeen] = useState({}); // 탭마다 마지막으로 본 시각. 그 뒤에 생긴 기록이 있으면 점을 찍는다
  const fresh = (t) => t.key !== tab && inc?.log.some((l) => l.who === t.who && l.at > (seen[t.key] ?? 0));
  const open = (key) => {
    setSeen({ ...seen, [tab]: Date.now(), [key]: Date.now() });
    setTab(key);
  };

  return (
    <div className="demo" data-tab={tab}>
      <div className="demo-bar">
        <p>
          <strong>시연 모드</strong> 실제로 신고·연락하지 않아요 · <a href={location.pathname}>끄기</a>
        </p>
        <div className="demo-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => open(t.key)}>
              {t.label}
              {fresh(t) && <span className="dot" aria-label="새 소식" />}
            </button>
          ))}
        </div>
      </div>
      <div className="demo-panes">
        <div className="pane pane-citizen">{children}</div>
        <div className="pane pane-ops">
          <OpsPanel inc={inc} />
        </div>
        <div className="pane pane-er">
          <ErPanel inc={inc} />
        </div>
      </div>
    </div>
  );
}
