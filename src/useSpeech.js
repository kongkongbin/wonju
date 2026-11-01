import { useRef, useState } from 'react';

// 브라우저 내장 음성인식 (Chrome·Edge·Safari). Firefox에는 없어서 버튼을 숨긴다
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

const ERRORS = {
  'not-allowed': '마이크 권한이 없습니다. 브라우저에서 허용하거나 글로 입력해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성인식을 쓸 수 없습니다. 글로 입력해 주세요.',
  'no-speech': '음성이 들리지 않았습니다. 다시 눌러 말씀해 주세요.',
  'audio-capture': '마이크를 찾지 못했습니다. 글로 입력해 주세요.',
  network: '음성인식 서버에 연결하지 못했습니다. 글로 입력해 주세요.',
};

/** 음성 입력. toggle(onText)로 시작·중지하고, 말하는 동안 onText에 지금까지 인식한 문장을 넘긴다 */
export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const rec = useRef(null);

  function toggle(onText) {
    if (rec.current) return rec.current.stop();
    setError(null);
    const r = new Recognition();
    r.lang = 'ko-KR';
    r.interimResults = true;
    r.onresult = (e) => onText([...e.results].map((x) => x[0].transcript).join(''));
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? '음성을 인식하지 못했습니다. 글로 입력해 주세요.');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    r.start();
    setListening(true);
  }

  return { supported: !!Recognition, listening, error, toggle, cancel: () => rec.current?.abort() };
}
