import { z } from 'zod';
import { retrieve } from '../rag/retrieve.js';
import { generateJson } from '../llm/claude.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { safetyFloor } from './safety.js';

const ResultSchema = z.object({
  selected_chunk_id: z.string(),
  ktas_level: z.coerce.number().int().min(1).max(5),
  level_reason: z.string(),
  matched_criteria: z.array(z.string()),
  suggested_department: z.string(),
  missing_info_questions: z.array(z.string()).max(5),
  confidence: z.coerce.number().min(0).max(1),
  call_119: z.boolean(),
});

/**
 * 자연어 증상 → KTAS 후보 검색(RAG) → LLM 판정 → 안전 규칙 적용
 * @param {string} input
 * @param {{topK?: number, model?: string, safetyInput?: string}} [opts] safetyInput: 안전 규칙에 넣을 문장 (기본은 input, safety.js safetyText 참고)
 */
export async function triage(input, { topK = 8, model, safetyInput = input } = {}) {
  const candidates = await retrieve(input, topK);
  const { json, usage, model: usedModel } = await generateJson({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input, candidates),
    schema: ResultSchema,
    model,
  });

  const parsed = ResultSchema.parse(json);
  const chosen = candidates.find((c) => c.id === parsed.selected_chunk_id);
  if (!chosen) throw new Error(`후보에 없는 id 를 선택함: ${parsed.selected_chunk_id}`);

  // 안전 규칙: 숫자가 작을수록 위급. LLM 등급이 하한보다 덜 위급하게 나오면 올린다.
  const safety = safetyFloor(safetyInput);
  const raised = safety.floor !== null && parsed.ktas_level > safety.floor;
  const finalLevel = raised ? safety.floor : parsed.ktas_level;

  return {
    input,
    symptom: { id: chosen.id, name: chosen.name, population: chosen.population },
    llmLevel: parsed.ktas_level,
    finalLevel,
    raisedBySafety: raised,
    safetyReasons: safety.reasons,
    ...parsed,
    call119: parsed.call_119 || finalLevel <= 2,
    candidates: candidates.map((c) => ({ id: c.id, name: c.name, population: c.population, score: c.score })),
    usage,
    model: usedModel,
  };
}
