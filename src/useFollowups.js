import { useRef, useState } from 'react';
import { safetyFloor, safetyText } from './lib/triage/safety.js';
import { speak, stopSpeaking } from './speak.js';

const ANSWER_WAIT_MS = 7000; // 질문을 읽은 뒤 답을 기다리는 시간. 말이 없으면 다음 질문으로 넘어간다
const AFTER_SPEAK_MS = 300; // 스피커 소리가 마이크에 들어가지 않게 잠깐 쉰다
const BLOCKED = ['not-allowed', 'service-not-allowed'];

/**
 * 음성 되묻기: 질문을 하나씩 읽고 답을 듣는다.
 * 답마다 판정하면 느려서 모아 두었다가 한 번에 넘기되, 위급한 답이 나오면 남은 질문을 건너뛰고 바로 넘긴다.
 * @param {ReturnType<import('./useSpeech.js').useSpeech>} speech
 * @param {(answers: {text: string, question: string}[]) => void} onFinish 답이 하나 이상 있을 때 불린다
 */
export function useFollowups(speech, onFinish) {
  // { questions, index, phase: 'asking'|'listening'|'blocked', live: 듣는 중인 말 }
  const [qa, setQa] = useState(null);
  const step = useRef(0); // 건너뛰기·그만하기 뒤에 늦게 도착하는 콜백을 무시한다
  const answers = useRef([]);

  function finish() {
    step.current++;
    setQa(null);
    const list = answers.current;
    answers.current = [];
    if (list.length) onFinish(list);
  }

  function ask(questions, index, prefix = '') {
    if (index >= questions.length) return finish();
    const id = ++step.current;
    setQa({ questions, index, phase: 'asking', live: '' });
    speak(prefix + questions[index], () => {
      setTimeout(() => {
        if (id === step.current) listen(questions, index);
      }, AFTER_SPEAK_MS);
    });
  }

  function listen(questions, index) {
    const id = step.current;
    let live = '';
    setQa({ questions, index, phase: 'listening', live: '' });
    speech.toggle({
      quiet: true,
      waitMs: ANSWER_WAIT_MS,
      onText: (text) => {
        live = text;
        if (id === step.current) setQa({ questions, index, phase: 'listening', live: text });
      },
      onDone: () => {
        if (id !== step.current) return;
        const turn = { text: live.trim(), question: questions[index] };
        if (turn.text) answers.current.push(turn);
        if (turn.text && safetyFloor(safetyText([turn])).floor !== null) return finish();
        ask(questions, index + 1);
      },
      onNothing: (failure) => {
        if (id !== step.current) return;
        // 눌러야만 마이크가 켜지는 기기라면 버튼을 보여 주고 기다린다
        if (BLOCKED.includes(failure)) setQa({ questions, index, phase: 'blocked', live: '' });
        else ask(questions, index + 1);
      },
    });
  }

  function halt() {
    step.current++;
    speech.cancel();
    stopSpeaking();
  }

  return {
    qa,
    start(questions, prefix) {
      answers.current = [];
      ask(questions, 0, prefix);
    },
    skip() {
      halt();
      ask(qa.questions, qa.index + 1);
    },
    /** 그만하기: 그때까지 받은 답으로 판정한다 */
    stop() {
      halt();
      finish();
    },
    /** 새로 시작: 받은 답도 버린다 */
    discard() {
      halt();
      answers.current = [];
      setQa(null);
    },
    answerByTap() {
      listen(qa.questions, qa.index);
    },
  };
}
