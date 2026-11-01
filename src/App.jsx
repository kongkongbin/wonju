import { useEffect, useRef, useState } from 'react';
import { requestTriage } from './api.js';
import ResultCard from './components/ResultCard.jsx';
import { useSpeech } from './useSpeech.js';

const EXAMPLES = [
  '아이가 40도 고열에 경련을 일으키고 입술이 파래져요',
  '점심 먹고부터 속이 더부룩하고 배가 가끔 찌릿해요',
  '왼쪽 머리가 가끔 찌릿한 느낌이 있어요',
];

export default function App() {
  const [turns, setTurns] = useState([]); // 사용자가 보낸 입력들 { text, question? }
  const [items, setItems] = useState([]); // 화면에 보이는 대화 { role, ... }
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState(null); // 지금 답하고 있는 추가 질문
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const speech = useSpeech();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, loading]);

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    speech.cancel(); // 듣는 중이면 멈춘다. 늦게 온 인식 결과가 비운 입력창을 다시 채우지 않게
    const turn = { text: trimmed, question };
    const nextTurns = [...turns, turn];
    setTurns(nextTurns);
    setItems((prev) => [...prev, { role: 'user', ...turn }]);
    setDraft('');
    setQuestion(null);
    setLoading(true);

    try {
      const result = await requestTriage(nextTurns);
      setItems((prev) => [...prev, { role: 'bot', result }]);
    } catch (e) {
      setItems((prev) => [...prev, { role: 'error', message: e.message }]);
    } finally {
      setLoading(false);
    }
  }

  function answer(q) {
    setQuestion(q);
    inputRef.current?.focus();
  }

  function reset() {
    speech.cancel();
    setTurns([]);
    setItems([]);
    setDraft('');
    setQuestion(null);
  }

  // 인식한 문장은 입력창에만 넣는다. 잘못 들었을 수 있으니 확인하고 보내게 한다
  function toggleMic() {
    const base = draft.trim();
    speech.toggle((text) => setDraft(base ? `${base} ${text}` : text));
  }

  function onSubmit(e) {
    e.preventDefault();
    send(draft);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  }

  // 가장 마지막 판정 결과에 대해서만 추가 질문 버튼을 보여 준다
  const lastBotIndex = items.map((i) => i.role).lastIndexOf('bot');

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>원주 응급 분류 도우미</h1>
          <p>증상을 적으면 KTAS 기준으로 응급도를 알려 드립니다</p>
        </div>
        {items.length > 0 && (
          <button type="button" className="ghost" onClick={reset}>
            새로 시작
          </button>
        )}
      </header>

      <p className="disclaimer">
        참고용 보조 도구이며 진단이 아닙니다. 의식이 없거나 숨쉬기 힘들거나 심한 출혈이 있으면 바로 <a href="tel:119">119</a>에 연락하세요.
      </p>

      <main className="chat" aria-live="polite">
        {items.length === 0 && (
          <section className="empty">
            <h2>어떤 증상이 있으신가요?</h2>
            <p>일상적인 말로 편하게 적어 주세요. 부족한 정보는 제가 되물어 볼게요.</p>
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip" onClick={() => send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </section>
        )}

        {items.map((item, i) => {
          if (item.role === 'user') {
            return (
              <div key={i} className="msg user">
                {item.question && <div className="quote">{item.question}</div>}
                <div className="bubble">{item.text}</div>
              </div>
            );
          }
          if (item.role === 'error') {
            return (
              <div key={i} className="msg bot">
                <div className="bubble error">{item.message}</div>
              </div>
            );
          }
          return (
            <div key={i} className="msg bot">
              <ResultCard
                result={item.result}
                reported={items.slice(0, i).filter((x) => x.role === 'user').map((x) => x.text)}
                onAnswer={answer}
                answerable={i === lastBotIndex && !loading}
              />
            </div>
          );
        })}

        {loading && (
          <div className="msg bot">
            <div className="bubble typing">KTAS 기준을 확인하는 중입니다…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form className="composer" onSubmit={onSubmit}>
        {question && (
          <div className="replying">
            <span>답변 중: {question}</span>
            <button type="button" onClick={() => setQuestion(null)} aria-label="질문 선택 취소">
              ×
            </button>
          </div>
        )}
        {speech.error && <p className="note warn">{speech.error}</p>}
        <div className="row">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={1000}
            placeholder={speech.listening ? '듣고 있습니다. 말씀해 주세요' : question ? '질문에 대한 답을 입력하세요' : turns.length ? '추가로 알려 주실 내용을 입력하세요' : '증상을 입력하세요'}
            disabled={loading}
          />
          {speech.supported && (
            <button type="button" className={speech.listening ? 'mic on' : 'mic'} onClick={toggleMic} disabled={loading} aria-pressed={speech.listening}>
              {speech.listening ? '듣는 중' : '음성'}
            </button>
          )}
          <button type="submit" disabled={loading || !draft.trim()}>
            보내기
          </button>
        </div>
      </form>
    </div>
  );
}
