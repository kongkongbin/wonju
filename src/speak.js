// 브라우저 내장 음성 안내. 키와 비용이 없고, 목소리는 기기마다 다르다
const synth = window.speechSynthesis;

export const canSpeak = !!synth;

/** 아이폰은 사용자가 누른 순간에 한 번 불러 둬야 나중에 저절로 말할 수 있다 */
export function unlockSpeech() {
  synth?.speak(new SpeechSynthesisUtterance(''));
}

/** @param {() => void} [onDone] 다 읽었을 때 (중간에 멈춰도 불린다) */
export function speak(text, onDone) {
  if (!synth) return onDone?.();
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  if (onDone) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      onDone();
    };
    // 끝났다는 신호를 주지 않는 기기가 있어서, 글자 수로 넉넉히 잡은 시간이 지나도 넘어간다
    const timer = setTimeout(finish, 2000 + text.length * 300);
    utterance.onend = finish;
    utterance.onerror = finish;
  }
  synth.speak(utterance);
}

export function stopSpeaking() {
  synth?.cancel();
}
