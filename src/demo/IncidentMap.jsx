import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ambulanceAt } from './incident.js';

const label = (text) => Object.assign(document.createElement('span'), { textContent: text });
const pin = (cls, text) => L.divIcon({ className: `pin ${cls}`, html: `<span>${text}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const STATUS = { waiting: '답 기다림', accepted: '수용 가능', rejected: '수용 불가', withdrawn: '요청 취소' };

/**
 * 신고 지도 (시연): 환자, 구급차, 수용을 물은 병원. 지도는 한 번만 만들고 표시만 바꾼다
 * @param {{inc: object}} props useIncident() 값
 */
export default function IncidentMap({ inc }) {
  const ref = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const ambulance = useRef(null);
  const fitted = useRef('');

  useEffect(() => {
    map.current = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const resized = new ResizeObserver(() => map.current.invalidateSize());
    resized.observe(ref.current);
    return () => {
      resized.disconnect();
      map.current.remove();
      ambulance.current = null;
      fitted.current = '';
    };
  }, []);

  // 환자·병원 표시는 병원 상태가 바뀔 때만 다시 그린다
  const key = `${inc.place?.lat}|${inc.chosen}|${inc.hospitals.map((h) => h.status).join()}`;
  useEffect(() => {
    if (!inc.place) return;
    layer.current.clearLayers();
    const me = [inc.place.lat, inc.place.lon];
    L.marker(me, { icon: pin('patient', '환자') }).addTo(layer.current).bindTooltip(label(inc.place.address ?? '환자 위치'));
    const chosen = inc.hospitals.find((h) => h.id === inc.chosen);
    for (const h of inc.hospitals) {
      L.marker([h.lat, h.lon], { icon: pin(`hosp ${h.status}`, '병'), zIndexOffset: h.id === inc.chosen ? 900 : 500 })
        .addTo(layer.current)
        .bindTooltip(label(`${h.name} · ${STATUS[h.status]}`));
    }
    if (chosen) L.polyline([me, [chosen.lat, chosen.lon]], { color: '#1f7f46', weight: 3, dashArray: '6 6' }).addTo(layer.current);

    const points = [me, [inc.station.lat, inc.station.lon], ...inc.hospitals.filter((h) => h.status !== 'withdrawn').map((h) => [h.lat, h.lon])];
    const fitKey = points.length + String(inc.chosen);
    if (fitted.current !== fitKey) {
      fitted.current = fitKey;
      map.current.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    }
  }, [key]);

  // 구급차는 진행에 따라 매번 옮긴다
  const pos = ambulanceAt(inc);
  useEffect(() => {
    if (!pos) return;
    if (!ambulance.current) ambulance.current = L.marker([pos.lat, pos.lon], { icon: pin('ambulance', '119'), zIndexOffset: 1000 }).addTo(map.current).bindTooltip(label('구급차'));
    else ambulance.current.setLatLng([pos.lat, pos.lon]);
  }, [pos?.lat, pos?.lon]);

  return <div ref={ref} className="plan-map incident-map" role="img" aria-label="환자 위치, 구급차, 수용을 물은 병원을 표시한 지도" />;
}
