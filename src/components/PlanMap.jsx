import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 병원 이름은 공공데이터에서 오므로 HTML이 아니라 글자로만 넣는다
const label = (text) => Object.assign(document.createElement('span'), { textContent: text });

/**
 * 내 위치와 갈 곳을 번호로 보여 주는 지도 (OpenStreetMap 타일, 키 불필요). 같은 내용은 아래 목록에도 있다
 * ponytail: 공개 타일 서버는 시연용 정도의 사용량만 허용한다. 실서비스는 국내 지도 업체 타일로 교체
 * @param {{center: {lat: number, lon: number}, picks: object[], others: object[]}} props picks: 번호를 붙일 곳(순서대로), others: 회색으로만 표시
 */
export default function PlanMap({ center, picks, others }) {
  const ref = useRef(null);

  useEffect(() => {
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

    const me = [center.lat, center.lon];
    L.circleMarker(me, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindTooltip(label('내 위치'));
    for (const p of others) {
      L.circleMarker([p.lat, p.lon], { radius: 5, color: '#5d6673', weight: 1, fillColor: '#9aa4b2', fillOpacity: 0.9 }).addTo(map).bindTooltip(label(p.name));
    }
    picks.forEach((p, i) => {
      const icon = L.divIcon({ className: 'pin', html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([p.lat, p.lon], { icon, zIndexOffset: 1000 }).addTo(map).bindTooltip(label(p.name));
    });

    map.fitBounds(L.latLngBounds([me, ...picks.map((p) => [p.lat, p.lon])]), { padding: [28, 28], maxZoom: 15 });
    // 접혀 있던 카드를 펼치거나 화면 폭이 바뀌면 지도 크기를 다시 잰다 (안 하면 회색 칸이 남는다)
    const resized = new ResizeObserver(() => map.invalidateSize());
    resized.observe(ref.current);
    return () => {
      resized.disconnect();
      map.remove();
    };
  }, [center, picks, others]);

  return <div ref={ref} className="plan-map" role="img" aria-label="내 위치와 추천 병원을 표시한 지도" />;
}
