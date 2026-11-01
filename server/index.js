import { fileURLToPath } from 'node:url';
import express from 'express';
import { triage } from '../src/lib/triage/triage.js';
import { safetyText } from '../src/lib/triage/safety.js';
import { addressOf, nearbyHospitals, openClinics } from '../src/lib/hospital/nearby.js';

const PORT = process.env.PORT ?? 3001;
const MAX_MESSAGES = 10;
const MAX_LENGTH = 1000;
const validCoords = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

const app = express();
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 배포 주소는 공개라서, 코드를 아는 사람만 Claude·공공데이터 호출을 쓰게 한다 (ACCESS_CODE가 없으면 검사하지 않는다)
app.use('/api', (req, res, next) => {
  const code = process.env.ACCESS_CODE;
  if (!code || req.get('x-access-code') === encodeURIComponent(code)) return next();
  res.status(401).json({ error: '접근 코드가 올바르지 않습니다.' });
});

/**
 * POST /api/triage
 * body: { messages: {text: string, question?: string|null}[] }  사용자가 지금까지 입력한 문장들
 *   question: 이 문장이 답한 추가 질문 (없으면 생략)
 * 대화 전체를 하나의 증상 설명으로 합쳐서 다시 판정한다.
 */
app.post('/api/triage', async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: `messages 는 1~${MAX_MESSAGES}개의 배열이어야 합니다.` });
  }
  const invalid = (m) =>
    typeof m?.text !== 'string' || !m.text.trim() || m.text.length > MAX_LENGTH ||
    (m.question != null && (typeof m.question !== 'string' || m.question.length > MAX_LENGTH));
  if (messages.some(invalid)) {
    return res.status(400).json({ error: `각 메시지는 1~${MAX_LENGTH}자의 문자열이어야 합니다.` });
  }

  // LLM에는 질문을 함께 적어 문맥을 유지하고, 안전 규칙에는 질문 문장이 끼지 않게 따로 넘긴다
  const input = messages.map((m) => (m.question ? `(질문: ${m.question}) 답변: ${m.text}` : m.text)).join('\n');
  try {
    const result = await triage(input, { safetyInput: safetyText(messages) });
    res.json(result);
  } catch (e) {
    console.error('[triage] 실패:', e.message);
    res.status(502).json({ error: '판정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

/**
 * POST /api/hospitals
 * body: { lat: number, lon: number }  사용자 위치 (WGS84)
 * 가까운 응급의료기관과 응급실 실시간 가용병상을 돌려준다.
 */
app.post('/api/hospitals', async (req, res) => {
  const { lat, lon } = req.body ?? {};
  if (!validCoords(lat, lon)) {
    return res.status(400).json({ error: 'lat, lon 은 위도·경도 숫자여야 합니다.' });
  }
  try {
    res.json({ hospitals: await nearbyHospitals(lat, lon) });
  } catch (e) {
    console.error('[hospitals] 실패:', e.message);
    res.status(502).json({ error: '병원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

/**
 * POST /api/clinics
 * body: { lat: number, lon: number, pediatric: boolean, department: string }  department: 판정이 추천한 진료과
 * 지금 진료 중인 가까운 병·의원을 돌려준다.
 */
app.post('/api/clinics', async (req, res) => {
  const { lat, lon, pediatric, department } = req.body ?? {};
  if (!validCoords(lat, lon)) {
    return res.status(400).json({ error: 'lat, lon 은 위도·경도 숫자여야 합니다.' });
  }
  const patient = { pediatric: pediatric === true, department: String(department ?? '').slice(0, MAX_LENGTH) };
  try {
    res.json({ clinics: await openClinics(lat, lon, patient) });
  } catch (e) {
    console.error('[clinics] 실패:', e.message);
    res.status(502).json({ error: '병원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

/**
 * POST /api/address
 * body: { lat: number, lon: number }  사용자 위치 (WGS84)
 * 119 신고 안내에 보여 줄 주소를 돌려준다. 못 찾으면 address 는 null.
 */
app.post('/api/address', async (req, res) => {
  const { lat, lon } = req.body ?? {};
  if (!validCoords(lat, lon)) {
    return res.status(400).json({ error: 'lat, lon 은 위도·경도 숫자여야 합니다.' });
  }
  try {
    res.json({ address: await addressOf(lat, lon) });
  } catch (e) {
    console.error('[address] 실패:', e.message);
    res.status(502).json({ error: '주소를 찾지 못했습니다.' });
  }
});

// Vercel에서는 api/index.js가 app을 가져다 쓴다. 직접 실행할 때만 포트를 연다
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`API 서버: http://localhost:${PORT}`));
}

export default app;
