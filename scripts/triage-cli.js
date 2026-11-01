// 사용: npm run triage -- "증상 문장" ["문장2" ...]   (인자가 없으면 샘플 5건)
import { triage } from '../src/lib/triage/triage.js';

const SAMPLES = [
  '아이가 40도 고열에 경련을 일으키고 입술이 파래져요',
  '아버지가 갑자기 말이 어눌해지고 오른쪽 팔에 힘이 하나도 없다고 하세요',
  '가슴이 쥐어짜듯 아프고 식은땀이 나요. 왼쪽 팔까지 저려요',
  '왼쪽 머리가 가끔 찌릿한 느낌이 있어',
  '어제부터 콧물이 나고 목이 살짝 아파요. 열은 없어요',
];
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLES;
const LABEL = { 1: '소생', 2: '긴급', 3: '응급', 4: '준응급', 5: '비응급' };

for (const input of inputs) {
  console.log(`\n${'='.repeat(70)}\n입력: ${input}`);
  try {
    const t0 = Date.now();
    const r = await triage(input);
    const raised = r.raisedBySafety ? `  <- 안전규칙으로 상향 (LLM: ${r.llmLevel}; ${r.safetyReasons.join(', ')})` : '';
    console.log(`선택 증상: [${r.symptom.population}] ${r.symptom.name} (${r.symptom.id})`);
    console.log(`KTAS ${r.finalLevel} (${LABEL[r.finalLevel]})${raised} | 신뢰도 ${r.confidence} | 119: ${r.call119 ? '예' : '아니오'}`);
    console.log(`근거: ${r.level_reason}`);
    console.log(`인용 기준: ${r.matched_criteria.join(' / ') || '-'}`);
    console.log(`추천 진료과: ${r.suggested_department}`);
    if (r.missing_info_questions.length) {
      console.log(`추가 질문: ${r.missing_info_questions.map((q, i) => `${i + 1}) ${q}`).join('  ')}`);
    }
    console.log(`후보 Top-3: ${r.candidates.slice(0, 3).map((c) => `${c.population[0]}:${c.name}`).join(', ')}`);
    console.log(
      `(${r.model}, ${((Date.now() - t0) / 1000).toFixed(1)}초, 토큰 in ${r.usage.input_tokens} / out ${r.usage.output_tokens})`,
    );
  } catch (e) {
    console.log(`오류: ${e.message}`);
  }
}
