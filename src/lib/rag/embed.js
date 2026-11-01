// bge-m3 임베딩을 Cloudflare Workers AI로 구한다. 모델이 2.2GB라 Vercel 함수(250MB)에 넣을 수 없어서 API를 쓴다.
// 직접 돌린 Xenova/bge-m3와 코사인 0.999999로 같아서, 그 모델로 만든 data/kb.json을 그대로 쓸 수 있다.
export const DEFAULT_MODEL = '@cf/baai/bge-m3';

/**
 * @param {string} text
 * @returns {Promise<number[]>} 정규화된 1024차원 벡터 (코사인 유사도 = 내적)
 */
export async function embed(text) {
  const { CF_ACCOUNT_ID: account, CF_API_TOKEN: token } = process.env;
  if (!account || !token) throw new Error('CF_ACCOUNT_ID, CF_API_TOKEN 이 없습니다 (.env 확인)');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${DEFAULT_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`임베딩 실패 (HTTP ${res.status})`);
  const { result } = await res.json();
  return result.data[0];
}
