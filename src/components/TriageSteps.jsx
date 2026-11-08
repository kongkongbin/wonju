const LEVEL_LABEL = { 1: '소생', 2: '긴급', 3: '응급', 4: '준응급', 5: '비응급' };

/** 안전 규칙이 한 일: 올렸는가, 신호는 있었지만 AI가 이미 그만큼 위급하게 봤는가, 신호가 없었는가 */
function safetyText(result) {
  const reasons = result.safetyReasons.join(', ');
  if (result.raisedBySafety) return `위험 신호(${reasons})가 있어 KTAS ${result.llmLevel}에서 ${result.finalLevel}로 올렸습니다.`;
  if (reasons) return `위험 신호(${reasons})가 있었고, AI 판단이 이미 그만큼 위급해서 그대로 둡니다.`;
  return '의식 저하, 경련, 호흡곤란 같은 위험 신호 표현은 없었습니다.';
}

/**
 * AI가 판정한 과정: 증상 → KTAS 기준 검색 → AI 판단 → 안전 규칙 → 결과
 * @param {{result: object, reported: string[], open: boolean}} props reported: 이 판정까지 사용자가 입력한 문장들, open: 처음부터 펼칠지
 */
export default function TriageSteps({ result, reported, open }) {
  const percent = Math.round(result.confidence * 100);
  const { search } = result;
  const said = reported.join(' / ');

  return (
    <details className="fold process" open={open}>
      <summary>AI가 판정한 과정</summary>
      <ol className="process-steps">
        <li>
          <p className="process-title">증상 듣기</p>
          <p className="hint">"{said.length > 140 ? `${said.slice(0, 140)}…` : said}"</p>
        </li>
        <li>
          <p className="process-title">KTAS 지침에서 비슷한 증상 찾기</p>
          <p className="hint">
            {search ? `${search.population ?? '소아·성인'} 증상 기준 ${search.total}개 중 ` : ''}비슷한 {result.candidates.length}개를 골랐습니다.
          </p>
          <ol className="candidates">
            {result.candidates.map((c) => (
              <li key={c.id} className={c.id === result.symptom.id ? 'picked' : ''}>
                {c.population} · {c.name}
              </li>
            ))}
          </ol>
        </li>
        <li>
          <p className="process-title">AI가 지침 기준과 비교</p>
          <p>
            <strong>
              {result.symptom.population} · {result.symptom.name}
            </strong>{' '}
            기준으로 KTAS {result.llmLevel}
          </p>
          <p className="reason">{result.level_reason}</p>
          {result.matched_criteria.length > 0 && (
            <ul className="criteria">
              {result.matched_criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className="meter" role="img" aria-label={`신뢰도 ${percent}%`}>
            <div className="meter-bar" style={{ width: `${percent}%` }} />
            <span>신뢰도 {percent}%</span>
          </div>
          <p className="hint">추천 진료과: {result.suggested_department}</p>
        </li>
        <li>
          <p className="process-title">안전 규칙 확인</p>
          <p className={result.raisedBySafety ? 'note warn' : 'hint'}>{safetyText(result)}</p>
        </li>
        <li className="final">
          <p className="process-title">
            결과: KTAS {result.finalLevel} · {LEVEL_LABEL[result.finalLevel]}
          </p>
        </li>
      </ol>
    </details>
  );
}
