import Call119Help from './Call119Help.jsx';
import ClinicList from './ClinicList.jsx';
import HospitalList from './HospitalList.jsx';

const LEVEL_LABEL ={ 1: '소생', 2: '긴급', 3: '응급', 4: '준응급', 5: '비응급' };

/** KTAS 4~5 안내. 응급실을 막지는 않는다 (아래 응급실 목록은 그대로 보인다) */
function MildCare({ pediatric, department }) {
  return (
    <div className="mild-care">
      <p className="followups-title">응급실이 아니어도 될 수 있습니다</p>
      <ul>
        <li>
          가까운 병·의원을 먼저 이용해 보세요. 더 많은 병원은{' '}
          <a href="https://www.e-gen.or.kr/egen/search_hospital.do" target="_blank" rel="noreferrer">
            응급의료포털
          </a>
          에서 찾을 수 있습니다.
        </li>
        {pediatric && (
          <li>
            밤이나 휴일에는 아이를 위한 달빛어린이병원이 있습니다.{' '}
            <a href="https://www.e-gen.or.kr/moonlight/main.do" target="_blank" rel="noreferrer">
              달빛어린이병원 찾기
            </a>
          </li>
        )}
        <li>증상이 나빠지거나 걱정되면 망설이지 말고 응급실이나 119에 연락하세요.</li>
      </ul>
      <ClinicList pediatric={pediatric} department={department} />
    </div>
  );
}

/**
 * 판정 결과 카드: 등급, 119 안내, 근거, 추가 질문
 * @param {{result: object, reported: string[], onAnswer: (question: string) => void, answerable: boolean}} props reported: 이 판정까지 사용자가 입력한 문장들
 */
export default function ResultCard({ result, reported, onAnswer, answerable }) {
  const level = result.finalLevel;
  const lowConfidence = result.confidence < 0.7;
  const pediatric = result.symptom.population === '소아';
  // 판정이 확실하지 않으면 응급실이 필요 없다는 인상을 주지 않는다
  const mild = level >= 4 && !result.call119 && !lowConfidence;

  return (
    <div className="result">
      {result.call119 && (
        <div className="alert119" role="alert">
          <strong>지금 119에 신고하세요.</strong>
          <span>응급 가능성이 높습니다. 이 결과를 기다리지 말고 연락하세요.</span>
          <a href="tel:119">119 전화하기</a>
        </div>
      )}
      {result.call119 && (
        <Call119Help population={result.symptom.population} reported={reported} judgement={`KTAS ${level} · ${LEVEL_LABEL[level]}, ${result.symptom.name}`} />
      )}

      <div className="result-head">
        <span className={`level level-${level}`}>
          KTAS {level} · {LEVEL_LABEL[level]}
        </span>
        <span className="symptom">
          {result.symptom.population} · {result.symptom.name}
        </span>
      </div>

      {result.raisedBySafety && (
        <p className="note warn">
          안전 규칙으로 등급을 올렸습니다 ({result.safetyReasons.join(', ')}). AI 판단은 {result.llmLevel}단계였습니다.
        </p>
      )}

      <p className="reason">{result.level_reason}</p>

      <div className="meter" aria-label={`신뢰도 ${Math.round(result.confidence * 100)}%`}>
        <div className="meter-bar" style={{ width: `${Math.round(result.confidence * 100)}%` }} />
        <span>
          신뢰도 {Math.round(result.confidence * 100)}%{lowConfidence && ' · 정보가 부족해 확정하기 어렵습니다'}
        </span>
      </div>

      <dl className="facts">
        <dt>추천 진료과</dt>
        <dd>{result.suggested_department}</dd>
        {result.matched_criteria.length > 0 && (
          <>
            <dt>적용한 KTAS 기준</dt>
            <dd>
              <ul>
                {result.matched_criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {result.missing_info_questions.length > 0 && answerable && (
        <div className="followups">
          <p className="followups-title">더 정확한 판정을 위해 알려 주세요</p>
          <div className="chips">
            {result.missing_info_questions.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => onAnswer(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {mild && <MildCare pediatric={pediatric} department={result.suggested_department} />}

      <HospitalList urgent={level <= 2} pediatric={pediatric} />

      <details className="candidates">
        <summary>비슷한 후보 증상 보기</summary>
        <ol>
          {result.candidates.map((c) => (
            <li key={c.id} className={c.id === result.symptom.id ? 'picked' : ''}>
              {c.population} · {c.name}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
