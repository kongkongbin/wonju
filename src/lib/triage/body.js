/** 받침이 있으면 '이', 없으면 '가' */
function subjectMark(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code % 28 !== 0 ? '이' : '가';
}

export const PAIN_SCORES = ['1~3', '4~7', '8~10']; // KTAS 통증 구간 (경도, 중등도, 중증)
// 화면에 보이는 말 → 문장에 넣는 말
export const PAIN_FEELS = { '찌르는 듯': '찌르듯이', '쥐어짜는 듯': '쥐어짜듯이', 화끈거림: '화끈거리게', 욱신욱신: '욱신욱신', 저림: '저리게', 묵직함: '묵직하게' };
export const PAIN_SINCE = ['방금', '몇 시간 전부터', '며칠 전부터'];

/**
 * 고른 부위와 통증을 판정에 넣을 문장으로 바꾼다. 아무 부위도 고르지 않으면 빈 문자열
 * @param {string[]} parts 예: ['가슴', '왼쪽 팔']
 * @param {boolean} child 아이가 아픈 경우 (소아 기준으로 검색되게 문장에 넣는다)
 * @param {{score?: string, feel?: string, since?: string}} [pain] score: PAIN_SCORES 중 하나, feel: PAIN_FEELS의 키, since: PAIN_SINCE 중 하나
 */
export function painSentence(parts, child, { score, feel, since } = {}) {
  if (!parts.length) return '';
  const names = parts.join(', ');
  const sentences = [`${child ? '아이가 ' : ''}${names}${subjectMark(names)} ${feel ? `${PAIN_FEELS[feel]} ` : ''}아파요`];
  if (score) sentences.push(`통증은 10점 중 ${score}점이에요`);
  if (since) sentences.push(since === '방금' ? '방금 시작됐어요' : `${since} 그래요`);
  return sentences.join('. ');
}
