import { useRef, useState } from 'react';

// 브라우저 내장 음성인식 (Chrome·Edge·Safari). Firefox에는 없어서 버튼을 숨긴다
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const SILENCE_MS = 1500; // 이만큼 조용하면 말이 끝난 것으로 본다

const ERRORS = {
  'not-allowed': '마이크 권한이 없습니다. 브라우저에서 허용하거나 글로 입력해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성인식을 쓸 수 없습니다. 글로 입력해 주세요.',
  'no-speech': '음성이 들리지 않았습니다. 다시 눌러 말씀해 주세요.',
  'audio-capture': '마이크를 찾지 못했습니다. 글로 입력해 주세요.',
  network: '음성인식 서버에 연결하지 못했습니다. 글로 입력해 주세요.',
};

/** 음성 입력. 듣는 중에 toggle을 다시 부르면 멈춘다 */
export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const rec = useRef(null);

  /**
   * @param {object} o
   * @param {(text: string) => void} o.onText 말하는 동안 지금까지 인식한 문장
   * @param {() => void} o.onDone 말이 끝났을 때 (인식한 말이 있고 오류·취소가 없을 때만)
   * @param {(failure: string|null) => void} [o.onNothing] 인식한 말 없이 끝났을 때
   * @param {number} [o.waitMs] 아무 말이 없으면 이 시간 뒤에 멈춘다 (아이폰은 스스로 끝내지 않을 수 있다)
   * @param {boolean} [o.quiet] 오류 문구를 화면에 띄우지 않는다
   */
  function toggle({ onText, onDone, onNothing, waitMs, quiet }) {
    if (rec.current) return rec.current.stop();
    setError(null);
    const r = new Recognition();
    let heard = false;
    let failure = null;
    let silence = waitMs ? setTimeout(() => r.stop(), waitMs) : undefined;
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.onresult = (e) => {
      heard = true;
      onText([...e.results].map((x) => x[0].transcript).join(''));
      // 브라우저마다 말이 끝났다고 판단하는 시점이 달라서, 잠시 조용하면 직접 멈춘다
      clearTimeout(silence);
      silence = setTimeout(() => r.stop(), SILENCE_MS);
    };
    r.onerror = (e) => {
      heard = false;
      failure = e.error;
      if (!quiet && e.error !== 'aborted') setError(ERRORS[e.error] ?? '음성을 인식하지 못했습니다. 글로 입력해 주세요.');
    };
    r.onend = () => {
      clearTimeout(silence);
      if (r.cancelled) return;
      rec.current = null;
      setListening(false);
      if (heard) onDone();
      else onNothing?.(failure);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      // 사용자가 누르지 않았을 때 시작을 막는 브라우저가 있다
      clearTimeout(silence);
      rec.current = null;
      onNothing?.('not-allowed');
    }
  }

  function cancel() {
    if (!rec.current) return;
    rec.current.cancelled = true;
    rec.current.abort();
    rec.current = null;
    setListening(false);
  }

  return { supported: !!Recognition, listening, error, toggle, cancel };
}
