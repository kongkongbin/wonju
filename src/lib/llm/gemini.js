const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Gemini REST 호출 (Structured Output). 429/5xx는 한 번 재시도한다.
 * @param {{system: string, user: string, schema: object, model?: string, apiKey?: string}} args
 * @returns {Promise<{json: any, usage: object, model: string}>}
 */
export async function generateJson({
  system,
  user,
  schema,
  model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  apiKey = process.env.GEMINI_API_KEY,
}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다 (.env 확인)');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new Error(`빈 응답 (finishReason: ${data.candidates?.[0]?.finishReason ?? '없음'})`);
      return { json: JSON.parse(text), usage: data.usageMetadata ?? {}, model };
    }
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}
