import assert from 'node:assert/strict';
import app from './index.js';

// 잘못된 좌표를 보내 외부 호출 없이 검사한다: 통과하면 400, 막히면 401
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const status = async (code) => {
  const headers = { 'Content-Type': 'application/json' };
  if (code !== undefined) headers['x-access-code'] = encodeURIComponent(code);
  return (await fetch(`${base}/api/hospitals`, { method: 'POST', headers, body: '{}' })).status;
};

try {
  delete process.env.ACCESS_CODE;
  assert.equal(await status(), 400, '코드를 설정하지 않으면 검사하지 않는다');

  process.env.ACCESS_CODE = '원주-2026';
  assert.equal(await status(), 401, '코드 없음');
  assert.equal(await status('틀린코드'), 401, '틀린 코드');
  assert.equal(await status('원주-2026'), 400, '맞는 코드 (한글 포함)');
  assert.equal((await fetch(`${base}/api/health`)).status, 200, '상태 확인은 코드 없이');
  console.log('접근 코드 검사 통과');
} finally {
  server.close();
}
