export const LEVEL_LABEL = { 1: '소생', 2: '긴급', 3: '응급', 4: '준응급', 5: '비응급' };

/** 갈 곳을 고르는 AI와 병원에 넘기는 판정 요약 */
export const planSummary = (r) =>
  `KTAS ${r.finalLevel} (${LEVEL_LABEL[r.finalLevel]}), ${r.symptom.population}, 증상: ${r.symptom.name}, 추천 진료과: ${r.suggested_department}, 판정 근거: ${r.level_reason}`;

/** 첫 문장.판정 근거가 길어서 첫 화면에는 이것만 보여 준다 (38.5처럼 숫자 안의 점에서는 끊지 않는다) */
export const firstSentence = (text) => text.match(/^.+?[.!?](?=\s|$)/s)?.[0] ?? text;

/** 응급실이 아니어도 된다고 안내해도 되는가. 판정이 확실하지 않으면 그런 인상을 주지 않는다 */
export const isMild = (result) => result.finalLevel >= 4 && !result.call119 && result.confidence >= 0.7;

/** 음성으로 읽어 줄 짧은 안내. 위급하면 119만 말한다 (다른 말로 신고를 늦추지 않는다) */
export function spokenSummary(result) {
  if (result.call119) return '응급 상황일 수 있습니다. 지금 바로 119에 전화하세요.';
  if (isMild(result)) return '응급실이 아니어도 될 수 있습니다. 증상이 나빠지거나 걱정되면 119에 연락하세요.';
  return '진료가 필요해 보입니다. 화면에서 가까운 응급실을 확인하세요. 증상이 나빠지면 바로 119에 전화하세요.';
}
