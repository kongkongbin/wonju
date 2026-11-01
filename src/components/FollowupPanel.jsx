/**
 * 음성 되묻기 중에 입력창 자리에 보여 주는 패널
 * @param {{qa: {questions: string[], index: number, phase: string, live: string}, onSkip: () => void, onStop: () => void, onTap: () => void}} props
 */
export default function FollowupPanel({ qa, onSkip, onStop, onTap }) {
  const status = qa.live || (qa.phase === 'listening' ? '듣고 있습니다. 말씀해 주세요' : '질문을 읽고 있습니다');

  return (
    <section className="composer followup" aria-label="추가 질문">
      <p className="hint">
        질문 {qa.index + 1}/{qa.questions.length}
      </p>
      <p className="followup-question">{qa.questions[qa.index]}</p>
      {qa.phase === 'blocked' ? (
        <button type="button" className="action" onClick={onTap}>
          눌러서 답하기
        </button>
      ) : (
        <p className={qa.phase === 'listening' ? 'followup-status on' : 'followup-status'} role="status">
          {status}
        </p>
      )}
      <div className="followup-actions">
        <button type="button" className="ghost" onClick={onSkip}>
          건너뛰기
        </button>
        <button type="button" className="ghost" onClick={onStop}>
          그만하기
        </button>
      </div>
    </section>
  );
}
