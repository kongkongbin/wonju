import { pipeline } from '@huggingface/transformers';

export const DEFAULT_MODEL = process.env.EMBED_MODEL ?? 'Xenova/bge-m3';

const extractors = new Map();

async function getExtractor(model) {
  if (!extractors.has(model)) extractors.set(model, pipeline('feature-extraction', model));
  return extractors.get(model);
}

/**
 * E5 계열은 검색 대상 문서에 "passage: ", 질문에 "query: " 접두어를 붙여야 한다.
 * (bge-m3 등 다른 모델은 접두어 없이 사용)
 * @param {string} text
 * @param {'passage'|'query'} kind
 * @param {string} [model]
 * @returns {Promise<number[]>} 정규화된 벡터 (코사인 유사도 = 내적)
 */
export async function embed(text, kind, model = DEFAULT_MODEL) {
  const ext = await getExtractor(model);
  const input = /e5/i.test(model) ? `${kind}: ${text}` : text;
  const out = await ext(input, { pooling: model.includes('bge') ? 'cls' : 'mean', normalize: true });
  return Array.from(out.data);
}
