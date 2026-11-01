/** 위도·경도 → Web Mercator(EPSG:3857). 네이버 웹 지도 주소가 쓰는 좌표계 */
export function mercator(lat, lon) {
  const R = 20037508.34;
  return [(lon * R) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * R) / Math.PI];
}

function webPoint(name, lat, lon) {
  const [x, y] = mercator(lat, lon);
  return `${x.toFixed(7)},${y.toFixed(7)},${encodeURIComponent(name)}`;
}

/**
 * 네이버 지도 자동차 길찾기 링크. 모바일은 공식 앱 스킴을 쓰고, PC는 웹 지도로 연다.
 * ponytail: 웹 지도 주소(/p/directions)는 공식 문서에 없는 형식이라 네이버가 바꾸면 깨질 수 있다
 * @param {{name: string, lat: number, lon: number}} h 도착 병원
 * @param {{lat: number, lon: number}|null} pos 사용자 위치. 없으면 앱은 현재 위치에서 출발하고, 웹은 출발지가 빈다
 * @returns {{href: string, newTab: boolean, fallback: string|null}} fallback: 앱이 없을 때 직접 보내야 할 웹 주소
 */
export function naverDirections(h, pos, ua = navigator.userAgent, appname = location.origin) {
  const web = `https://map.naver.com/p/directions/${pos ? webPoint('내 위치', pos.lat, pos.lon) : '-'}/${webPoint(h.name, h.lat, h.lon)}/-/car`;
  const start = pos ? `slat=${pos.lat}&slng=${pos.lon}&sname=${encodeURIComponent('내 위치')}&` : '';
  const route = `route/car?${start}dlat=${h.lat}&dlng=${h.lon}&dname=${encodeURIComponent(h.name)}&appname=${encodeURIComponent(appname)}`;

  if (/Android/i.test(ua)) {
    const intent = 'scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap';
    // 앱이 없으면 기본은 플레이스토어로 가는데, 응급 상황이라 웹 지도로 보낸다
    return { href: `intent://${route}#Intent;${intent};S.browser_fallback_url=${encodeURIComponent(web)};end`, newTab: false, fallback: null };
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return { href: `nmap://${route}`, newTab: false, fallback: web };
  return { href: web, newTab: true, fallback: null };
}

/** iOS는 앱이 없을 때 갈 곳을 링크에 담을 수 없다 → 앱으로 넘어가지 않고 화면이 그대로면 웹 지도로 보낸다 */
export function fallbackIfNoApp(url) {
  const timer = setTimeout(() => {
    location.href = url;
  }, 2500);
  document.addEventListener('visibilitychange', () => clearTimeout(timer), { once: true });
}
