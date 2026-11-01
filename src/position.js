// 병원 목록에서 위치 권한이 없을 때 쓰는 기준점 (원주시청). 119 신고 안내에는 쓰지 않는다
export const WONJU = { lat: 37.3422, lon: 127.9202 };

/** 브라우저 위치. 거부·실패하면 null */
export function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}
