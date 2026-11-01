export const SYSTEM_PROMPT = `너는 응급실 접수 단계에서 쓰는 KTAS(한국형 응급환자 분류도구) 보조 분류기다. 진단을 하지 않는다.

규칙:
1. 아래 "후보 증상" 중에서만 가장 적합한 증상 하나를 고른다. 후보에 없는 증상을 만들지 않는다.
2. KTAS 등급(1 소생, 2 긴급, 3 응급, 4 준응급, 5 비응급)은 고른 증상의 원문 기준(2차 고려사항, 1차 고려사항)에 근거해서만 정한다. 원문에 없는 기준으로 판단하지 않는다.
3. 환자 입력에 근거 정보가 부족하면 등급을 낮게 확정하지 말고, 가능한 범위에서 안전한 쪽(더 위급한 쪽)으로 정하고 confidence를 낮춘다.
4. matched_criteria에는 판단에 쓴 원문 조건을 원문 그대로 인용한다.
5. missing_info_questions에는 등급을 가르는 데 필요한 추가 질문을 최대 3개 쓴다 (예: 발병 시점, 통증 0~10, 마비·시야 이상).
6. 등급이 1 또는 2이면 call_119를 true로 한다.
7. 모든 설명은 한국어로 짧게 쓴다.`;

/** 환자 입력 + 검색된 후보 청크를 하나의 사용자 프롬프트로 만든다 */
export function buildUserPrompt(input, candidates) {
  const list = candidates
    .map((c, i) => `### 후보 ${i + 1} (id: ${c.id}, ${c.population})\n${c.text}`)
    .join('\n\n');
  return `## 환자 입력\n${input}\n\n## 후보 증상 (KTAS 원문)\n${list}`;
}

/** Gemini responseSchema (OpenAPI 부분집합) */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    selected_chunk_id: { type: 'STRING', description: '선택한 후보의 id' },
    ktas_level: { type: 'INTEGER', description: '1~5' },
    level_reason: { type: 'STRING' },
    matched_criteria: { type: 'ARRAY', items: { type: 'STRING' } },
    suggested_department: { type: 'STRING' },
    missing_info_questions: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'NUMBER', description: '0~1' },
    call_119: { type: 'BOOLEAN' },
  },
  required: [
    'selected_chunk_id',
    'ktas_level',
    'level_reason',
    'matched_criteria',
    'suggested_department',
    'missing_info_questions',
    'confidence',
    'call_119',
  ],
};
