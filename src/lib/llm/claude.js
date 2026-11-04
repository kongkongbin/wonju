import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

// 대회 AWS 서버에서는 키 없이 서버 권한으로 Bedrock을 부른다 (AI_PROVIDER=bedrock)
const onBedrock = process.env.AI_PROVIDER === 'bedrock';
let client;

async function createClient() {
  if (onBedrock) {
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
    return new AnthropicBedrock({ awsRegion: process.env.AWS_REGION });
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 가 없습니다 (.env 확인)');
  return new Anthropic();
}

/**
 * Claude 호출 (Structured Output). 429/5xx 재시도는 SDK가 한다 (기본 2회).
 * 안전 분류기가 의료 문장을 거절하면 서버가 다른 모델로 다시 돌린다 (fallbacks: 'default').
 * Bedrock은 fallbacks를 받지 않아서, 거절되면 그대로 오류가 된다.
 * @param {{system: string, user: string, schema: import('zod').ZodType, model?: string}} args schema: 응답 형식 zod 스키마
 * @returns {Promise<{json: any, usage: object, model: string}>}
 */
export async function generateJson({ system, user, schema, model = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5' }) {
  client ??= await createClient();

  const res = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    ...(onBedrock ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
  });
  if (res.stop_reason === 'refusal') throw new Error(`응답 거절 (${res.stop_details?.category ?? '사유 없음'})`);
  if (!res.parsed_output) throw new Error(`응답을 해석하지 못함 (stop_reason: ${res.stop_reason})`);
  return { json: res.parsed_output, usage: res.usage, model: res.model };
}
