// LLM 판단과 무관하게 최소 위급도를 보장하는 규칙 기반 안전망 (KTAS 1~2단계 상당 신호).
// 의료진 검수 전 초안이므로 키워드는 보수적으로(과소분류 방지 방향) 잡는다.
const RULES = [
  { floor: 1, re: /의식이?\s*(없|잃)|숨을?\s*(안|못)\s*쉬|호흡이?\s*(멈|정지)|맥박이?\s*(없|안)|심정지|심장이?\s*멈/, label: '의식 없음/호흡·맥박 정지' },
  { floor: 2, re: /경련|발작|거품을?\s*물|경기를?\s*(하|해|한)/, label: '경련·발작' },
  { floor: 2, re: /입술이?\s*(파|새파)|청색증/, label: '청색증' },
  { floor: 2, re: /피를?\s*토|토혈|피가\s*(멈추지|안\s*멈)|대량\s*출혈/, label: '토혈·지혈 안 되는 출혈' },
  { floor: 2, re: /말이?\s*(어눌|안\s*나)|한쪽\s*(팔|다리|얼굴).{0,6}(힘|마비|처)|얼굴이?\s*한쪽/, label: '뇌졸중 의심 신호' },
  { floor: 2, re: /숨이?\s*(안\s*쉬어|막혀|넘어)|숨쉬기\s*(너무\s*)?힘/, label: '심한 호흡곤란' },
];

/**
 * @param {string} input
 * @returns {{floor: number|null, reasons: string[]}} floor: 허용되는 가장 낮은 위급도 (숫자가 작을수록 위급)
 */
export function safetyFloor(input) {
  const hit = RULES.filter((r) => r.re.test(input));
  return { floor: hit.length ? Math.min(...hit.map((r) => r.floor)) : null, reasons: hit.map((r) => r.label) };
}

const NEGATIVE = /^\s*(아니|아뇨|없|안\s|전혀|괜찮)/;

/**
 * 안전 규칙에 넣을 문장. AI가 만든 추가 질문("경련이 있었나요?")에 키워드가 들어 있으므로
 * 답이 분명한 부정("아니요", "없어요")이면 질문은 빼고 답만 검사한다.
 * 긍정·모호한 답은 질문까지 함께 검사한다 (과소분류 방지).
 * @param {{text: string, question?: string|null}[]} turns
 */
export function safetyText(turns) {
  return turns.map((t) => (t.question && !NEGATIVE.test(t.text) ? `${t.question} ${t.text}` : t.text)).join('\n');
}
