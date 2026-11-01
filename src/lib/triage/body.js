/** 받침이 있으면 '이', 없으면 '가' */
function subjectMark(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code % 28 !== 0 ? '이' : '가';
}

/**
 * 고른 부위를 판정에 넣을 문장으로 바꾼다. 아무것도 고르지 않으면 빈 문자열
 * @param {string[]} parts 예: ['가슴', '왼쪽 팔']
 * @param {boolean} child 아이가 아픈 경우 (소아 기준으로 검색되게 문장에 넣는다)
 */
export function painSentence(parts, child) {
  if (!parts.length) return '';
  const names = parts.join(', ');
  return `${child ? '아이가 ' : ''}${names}${subjectMark(names)} 아파요`;
}
