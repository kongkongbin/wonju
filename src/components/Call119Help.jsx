import { useEffect, useRef, useState } from 'react';
import { requestAddress } from '../api.js';
import { getPosition } from '../position.js';

/**
 * 119 통화 중 그대로 읽을 수 있게 위치와 증상을 모아 보여 준다.
 * 병원 목록과 달리 위치를 못 받아도 원주시청으로 대신하지 않는다 (구급차가 엉뚱한 곳으로 갈 수 있다)
 * @param {{population: string, reported: string[], judgement: string}} props reported: 사용자가 입력한 문장들
 */
export default function Call119Help({ population, reported, judgement }) {
  const [place, setPlace] = useState({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // 개발 모드의 StrictMode가 두 번 불러도 주소는 한 번만 조회한다
    started.current = true;
    getPosition().then(async (pos) => {
      if (!pos) return setPlace({ status: 'none' });
      setPlace({ status: 'done', pos }); // 주소를 기다리지 않고 좌표부터 보여 준다
      const { address } = await requestAddress(pos.lat, pos.lon).catch(() => ({}));
      setPlace({ status: 'done', pos, address });
    });
  }, []);

  return (
    <div className="call-help">
      <p className="followups-title">통화할 때 읽어 주세요</p>
      <dl className="facts">
        <dt>어디</dt>
        <dd>
          {place.status === 'loading' && '위치를 확인하는 중입니다…'}
          {place.status === 'none' && '위치를 받지 못했습니다. 주변 건물이나 도로 이름을 말씀해 주세요.'}
          {place.status === 'done' && (
            <>
              {place.address && <div>{place.address} 부근</div>}
              <div className="hint">
                위도 {place.pos.lat.toFixed(5)}, 경도 {place.pos.lon.toFixed(5)}
              </div>
              <div className="hint">실제 위치와 다를 수 있습니다. 아는 주소가 있으면 그 주소를 말씀해 주세요.</div>
            </>
          )}
        </dd>
        <dt>환자</dt>
        <dd>{population}</dd>
        <dt>증상</dt>
        <dd>{reported.join(' / ')}</dd>
        <dt>앱 판정 (참고)</dt>
        <dd>{judgement}</dd>
      </dl>
    </div>
  );
}
