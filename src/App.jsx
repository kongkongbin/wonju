import { useEffect, useRef, useState } from 'react';
import { requestTriage } from './api.js';
import BodyMap from './components/BodyMap.jsx';
import FollowupPanel from './components/FollowupPanel.jsx';
import { MicIcon, PhoneIcon, StopIcon } from './components/icons.jsx';
import ResultCard from './components/ResultCard.jsx';
import { spokenSummary } from './lib/triage/spoken.js';
import { canSpeak, speak, stopSpeaking, unlockSpeech } from './speak.js';
import { useFollowups } from './useFollowups.js';
import { useSpeech } from './useSpeech.js';

const EXAMPLES = [
  '아이가 40도 고열에 경련을 일으키고 입술이 파래져요',
  '점심 먹고부터 속이 더부룩하고 배가 가끔 찌릿해요',
  '왼쪽 머리가 가끔 찌릿한 느낌이 있어요',
];
const SEND_DELAY_MS = 2000; // 말이 끝나고 보내기까지 잘못 들은 말을 취소할 시간 (App.css .sending-bar와 맞춘다)

export default function App() {
  const [items, setItems] = useState([]); // 화면에 보이는 대화 { role, ... }
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState(null); // 지금 답하고 있는 추가 질문
  const [loading, setLoading] = useState(false);
  const [sendSoon, setSendSoon] = useState(false); // 말이 끝나서 곧 자동으로 보내는 중
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const turns = useRef([]); // 사용자가 보낸 입력들 { text, question? }. 음성 되묻기 콜백에서도 최신 값을 읽어야 해서 ref로 둔다
  const asked = useRef(false); // 음성 되묻기는 대화마다 한 번만 한다
  const voiceTurn = useRef(false); // 이번 입력을 말로 했는가. 말로 물으면 말로 답하고, 글로 물으면 조용히 둔다
  const bottomRef = useRef(null);
  const lastRef = useRef(null);
  const inputRef = useRef(null);
  const speech = useSpeech();
  const followups = useFollowups(speech, (answers) => judge(answers, true));

  useEffect(() => {
    // 판정이 나오면 카드의 맨 위(단계와 다음 행동)가 보이게 한다
    if (items.at(-1)?.role === 'bot') lastRef.current?.scrollIntoView({ block: 'start' });
    else bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [items, loading]);

  useEffect(() => {
    if (!sendSoon) return;
    const timer = setTimeout(() => send(draft), SEND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sendSoon]);

  function say(text) {
    if (!mutedRef.current) speak(text);
  }

  /** 판정을 말로 알려 주고, 위급하지 않으면 질문을 이어 간다 (위급하면 119만 말해서 신고를 늦추지 않는다) */
  function replyAloud(result) {
    const questions = result.missing_info_questions.slice(0, 3);
    if (mutedRef.current || result.call119 || !questions.length || !speech.supported || asked.current) {
      return say(spokenSummary(result));
    }
    asked.current = true;
    followups.start(questions, `${spokenSummary(result)} 몇 가지만 여쭤볼게요. `);
  }

  async function judge(newTurns, aloud) {
    stopSpeaking();
    turns.current = [...turns.current, ...newTurns];
    setItems((prev) => [...prev, ...newTurns.map((t) => ({ role: 'user', ...t }))]);
    setDraft('');
    setQuestion(null);
    setLoading(true);

    try {
      const result = await requestTriage(turns.current);
      setItems((prev) => [...prev, { role: 'bot', result }]);
      if (aloud) replyAloud(result);
    } catch (e) {
      setItems((prev) => [...prev, { role: 'error', message: `${e.message} 위급하면 바로 119에 전화하세요.` }]);
      if (aloud) say('판정하지 못했습니다. 위급하면 바로 119에 전화하세요.');
    } finally {
      setLoading(false);
    }
  }

  function send(text) {
    setSendSoon(false);
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    speech.cancel(); // 듣는 중이면 멈춘다. 늦게 온 인식 결과가 비운 입력창을 다시 채우지 않게
    const aloud = voiceTurn.current;
    voiceTurn.current = false;
    judge([{ text: trimmed, question }], aloud);
  }

  function toggleMic() {
    unlockSpeech();
    stopSpeaking();
    setSendSoon(false);
    setVoiceUsed(true);
    voiceTurn.current = true;
    const base = draft.trim();
    speech.toggle({
      onText: (text) => setDraft(base ? `${base} ${text}` : text),
      onDone: () => setSendSoon(true),
    });
  }

  function answer(q) {
    setQuestion(q);
    // 말로 쓰던 중이면 질문을 누르는 것만으로 바로 듣는다
    if (voiceUsed && speech.supported && !speech.listening) toggleMic();
    else inputRef.current?.focus();
  }

  function cancelSend() {
    setSendSoon(false);
    inputRef.current?.focus();
  }

  function toggleMuted() {
    mutedRef.current = !muted;
    setMuted(!muted);
    stopSpeaking();
    if (followups.qa) followups.stop();
  }

  function reset() {
    speech.cancel();
    stopSpeaking();
    followups.discard();
    voiceTurn.current = false;
    asked.current = false;
    turns.current = [];
    setSendSoon(false);
    setItems([]);
    setDraft('');
    setQuestion(null);
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
  const isEmpty = items.length === 0;

  return (
    <div className="app">
      <header className="top">
        <h1>원주 응급 분류 도우미</h1>
        <div className="top-actions">
          {voiceUsed && canSpeak && (
            <button type="button" className="ghost" onClick={toggleMuted} aria-pressed={muted}>
              {muted ? '소리 켜기' : '소리 끄기'}
            </button>
          )}
          {!isEmpty && (
            <button type="button" className="ghost" onClick={reset}>
              새로 시작
            </button>
          )}
          <a className="call" href="tel:119" aria-label="119에 전화하기">
            <PhoneIcon size={18} />
            119
          </a>
        </div>
      </header>

      <main className="chat" aria-live="polite">
        {isEmpty && (
          <section className="empty">
            <h2>어떤 증상이 있으신가요?</h2>
            {speech.supported ? (
              <>
                <button type="button" className={speech.listening ? 'mic-hero on' : 'mic-hero'} onClick={toggleMic} disabled={loading} aria-pressed={speech.listening}>
                  {speech.listening ? <StopIcon size={26} /> : <MicIcon size={26} />}
                  {speech.listening ? '듣고 있습니다. 말씀해 주세요' : '눌러서 말하기'}
                </button>
                <p className="hint">말이 끝나면 바로 판정합니다. 아래에 글로 적어도 됩니다.</p>
              </>
            ) : (
              <p className="hint">일상적인 말로 편하게 적어 주세요.</p>
            )}
            <BodyMap
              onChange={(sentence) => {
                setSendSoon(false);
                setDraft(sentence);
              }}
              onSubmit={send}
            />
            <p className="disclaimer">
              참고용 보조 도구이며 진단이 아닙니다. 의식이 없거나 숨쉬기 힘들거나 심한 출혈이 있으면 바로 <a href="tel:119">119</a>에 연락하세요.
            </p>
            <p className="followups-title">이렇게 말해 보세요</p>
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
            <div key={i} className="msg bot" ref={i === items.length - 1 ? lastRef : null}>
              <ResultCard
                result={item.result}
                reported={items.slice(0, i).filter((x) => x.role === 'user').map((x) => x.text)}
                onAnswer={answer}
                answerable={i === lastBotIndex && !loading && !followups.qa}
                onReplay={() => speak(spokenSummary(item.result))}
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

      {followups.qa ? (
        <FollowupPanel qa={followups.qa} onSkip={followups.skip} onStop={followups.stop} onTap={followups.answerByTap} />
      ) : (
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
          {sendSoon && (
            <div className="sending" role="status">
              <span>곧 보냅니다. 잘못 들었으면 취소하세요.</span>
              <button type="button" onClick={cancelSend}>
                취소
              </button>
              <i className="sending-bar" />
            </div>
          )}
          <div className="row">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setSendSoon(false);
                setDraft(e.target.value);
              }}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={1000}
              aria-label="증상 입력"
              placeholder={speech.listening ? '듣고 있습니다. 말씀해 주세요' : question ? '질문에 대한 답을 입력하세요' : isEmpty ? '증상을 입력하세요' : '추가로 알려 주실 내용을 입력하세요'}
              disabled={loading}
            />
            {speech.supported && !isEmpty && (
              <button
                type="button"
                className={speech.listening ? 'mic on' : 'mic'}
                onClick={toggleMic}
                disabled={loading}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? '듣기 중지' : '음성으로 입력'}
              >
                {speech.listening ? <StopIcon size={24} /> : <MicIcon size={24} />}
              </button>
            )}
            <button type="submit" disabled={loading || !draft.trim()}>
              보내기
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
