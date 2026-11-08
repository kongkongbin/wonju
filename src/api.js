// 배포판의 접근 코드. 저장은 편의일 뿐이라 막혀 있어도 이번 방문 동안은 메모리로 동작한다
let accessCode = '';
try {
  accessCode = localStorage.getItem('accessCode') ?? '';
} catch {}

async function post(path, body, askCode = true) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-code': encodeURIComponent(accessCode) },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && askCode) {
    const code = window.prompt('접근 코드를 입력하세요')?.trim();
    if (code) {
      accessCode = code;
      try {
        localStorage.setItem('accessCode', code);
      } catch {}
      return post(path, body, false);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  return data;
}

/**
 * 서버에 증상 판정을 요청한다.
 * @param {{text: string, question?: string|null}[]} messages 지금까지 사용자가 입력한 문장들 (question: 답한 추가 질문)
 * @returns {Promise<object>} triage 결과 (서버의 triage() 반환값)
 */
export const requestTriage = (messages) => post('/api/triage', { messages });

/**
 * 위치에서 가까운 응급실과 실시간 가용병상을 요청한다.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{hospitals: object[]}>} 서버 nearbyHospitals() 반환값
 */
export const requestHospitals = (lat, lon) => post('/api/hospitals', { lat, lon });

/**
 * 판정 뒤 갈 곳 1·2·3을 요청한다.
 * @param {{lat: number, lon: number, mode: 'urgent'|'er'|'mild', patient: string, pediatric: boolean, department: string}} body
 * @returns {Promise<object>} 서버 makePlan() 반환값
 */
export const requestPlan = (body) => post('/api/plan', body);

/**
 * 위치의 주소를 요청한다.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{address: string|null}>}
 */
export const requestAddress = (lat, lon) => post('/api/address', { lat, lon });
