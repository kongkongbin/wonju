// 브라우저 내장 음성 안내. 키와 비용이 없고, 목소리는 기기마다 다르다
const synth = window.speechSynthesis;

export const canSpeak = !!synth;

/** 아이폰은 사용자가 누른 순간에 한 번 불러 둬야 나중에 저절로 말할 수 있다 */
export function unlockSpeech() {
  synth?.speak(new SpeechSynthesisUtterance(''));
}

export function speak(text) {
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  synth.speak(utterance);
}

export function stopSpeaking() {
  synth?.cancel();
}
