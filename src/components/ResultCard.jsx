import { useState } from 'react';
import { firstSentence, isMild } from '../lib/triage/spoken.js';
import { canSpeak } from '../speak.js';
import Call119Help from './Call119Help.jsx';
import ClinicList from './ClinicList.jsx';
import HospitalList from './HospitalList.jsx';
import { PhoneIcon, SpeakerIcon } from './icons.jsx';

const LEVEL_LABEL = { 1: '소생', 2: '긴급', 3: '응급', 4: '준응급', 5: '비응급' };

/** KTAS 4~5 안내. 응급실을 막지는 않는다 (아래 응급실 찾기는 그대로 보인다) */
function MildCare({ pediatric, department }) {
  return (
    <>
      <ClinicList pediatric={pediatric} department={department} />
      <ul className="mild-care">
        <li>
          더 많은 병원은{' '}
          <a href="https://www.e-gen.or.kr/egen/search_hospital.do" target="_blank" rel="noreferrer">
            응급의료포털
          </a>
          에서 찾을 수 있습니다.
        </li>
        {pediatric && (
          <li>
            밤이나 휴일에는{' '}
            <a href="https://www.e-gen.or.kr/moonlight/main.do" target="_blank" rel="noreferrer">
              달빛어린이병원
            </a>
            도 있습니다.
          </li>
        )}
        <li>증상이 나빠지거나 걱정되면 망설이지 말고 응급실이나 119에 연락하세요.</li>
      </ul>
    </>
  );
}

/** 5단계 중 어디인지 한눈에 보여 준다. 위치와 숫자로도 알 수 있어서 색만으로 구분하지 않는다 */
function LevelScale({ level }) {
  return (
    <div className="scale" role="img" aria-label={`5단계 중 ${level}단계, ${LEVEL_LABEL[level]}. 1단계가 가장 위급합니다`}>
      <ol>
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n} className={n === level ? `level-${n} current` : ''}>
            {n}
          </li>
        ))}
      </ol>
      <div className="scale-ends">
        <span>가장 위급</span>
        <span>덜 급함</span>
      </div>
    </div>
  );
}

const UNSURE = '잘 모르겠어요'; // 안전 규칙이 부정 답으로 보지 않아서, 질문에 든 위험 신호까지 검사한다

/** 추가 질문은 답을 고르기만 하면 된다. 고른 답을 모아 한 번에 다시 판정한다 */
function FollowupCheck({ questions, onAnswers }) {
  const [picked, setPicked] = useState({});
  const answers = questions.filter((q) => picked[q.question]).map((q) => ({ question: q.question, text: picked[q.question] }));
  const pick = (question, option) => setPicked({ ...picked, [question]: picked[question] === option ? undefined : option });

  return (
    <div className="checklist">
      {questions.map(({ question, options }) => (
        <fieldset key={question} className="check-item">
          <legend>{question}</legend>
          <div className="seg">
            {[...options.filter((o) => !/모름|모르/.test(o)).slice(0, 4), UNSURE].map((option) => (
              <button key={option} type="button" className={picked[question] === option ? 'on' : ''} aria-pressed={picked[question] === option} onClick={() => pick(question, option)}>
                {option === UNSURE ? '모름' : option}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="button" className="action" disabled={!answers.length} onClick={() => onAnswers(answers)}>
        {answers.length ? `고른 답 ${answers.length}개로 다시 판정` : '해당하는 답을 골라 주세요'}
      </button>
    </div>
  );
}

/**
 * 판정 결과 카드. 첫 화면에는 단계와 다음 행동만 두고 근거는 접어 둔다.
 * @param {{result: object, reported: string[], onAnswers: (answers: {question: string, text: string}[]) => void, answerable: boolean, onReplay: () => void}} props
 *   reported: 이 판정까지 사용자가 입력한 문장들, onReplay: 음성 안내 다시 듣기
 */
export default function ResultCard({ result, reported, onAnswers, answerable, onReplay }) {
  const level = result.finalLevel;
  const urgent = result.call119;
  const lowConfidence = result.confidence < 0.7;
  const pediatric = result.symptom.population === '소아';
  const mild = isMild(result);
  const percent = Math.round(result.confidence * 100);
  const questions = answerable ? result.missing_info_questions : [];

  return (
    <article className="result">
      <header className={`verdict level-${level}`}>
        <div>
          <strong>
            KTAS {level} · {LEVEL_LABEL[level]}
          </strong>
          <span>
            {result.symptom.population} · {result.symptom.name}
          </span>
        </div>
        {canSpeak && (
          <button type="button" className="replay" onClick={onReplay}>
            <SpeakerIcon size={18} />
            듣기
          </button>
        )}
      </header>

      <div className="result-body">
        <LevelScale level={level} />
        {urgent ? (
          <>
            <div role="alert">
              <p className="headline">지금 119에 신고하세요</p>
              <p className="lead">응급 가능성이 높습니다. 이 결과를 기다리지 말고 연락하세요.</p>
            </div>
            <a className="action call-action" href="tel:119">
              <PhoneIcon size={22} />
              119 전화하기
            </a>
            <Call119Help population={result.symptom.population} reported={reported} judgement={`KTAS ${level} · ${LEVEL_LABEL[level]}, ${result.symptom.name}`} />
          </>
        ) : (
          <div>
            <p className="headline">{mild ? '응급실이 아니어도 될 수 있습니다' : level === 3 ? '빠른 진료가 필요해 보입니다' : '확실하지 않아 진료 확인을 권합니다'}</p>
            <p className="lead">{firstSentence(result.level_reason)}</p>
          </div>
        )}

        {lowConfidence && <p className="note warn">정보가 부족해 확정하기 어렵습니다.</p>}

        {!urgent && questions.length > 0 && (
          <div>
            <p className="followups-title">알려 주시면 더 정확해져요</p>
            <FollowupCheck questions={questions} onAnswers={onAnswers} />
          </div>
        )}

        {mild && <MildCare pediatric={pediatric} department={result.suggested_department} />}

        <HospitalList urgent={level <= 2} pediatric={pediatric} primary={!urgent && !mild} />

        {urgent && questions.length > 0 && (
          <details className="fold">
            <summary>신고 후 더 알려 주실 수 있으면</summary>
            <FollowupCheck questions={questions} onAnswers={onAnswers} />
          </details>
        )}

        <details className="fold">
          <summary>판정 근거 보기</summary>
          <div className="fold-body">
            {result.raisedBySafety && (
              <p className="note warn">
                안전 규칙으로 등급을 올렸습니다 ({result.safetyReasons.join(', ')}). AI 판단은 {result.llmLevel}단계였습니다.
              </p>
            )}
            <p className="reason">{result.level_reason}</p>
            <div className="meter" role="img" aria-label={`신뢰도 ${percent}%`}>
              <div className="meter-bar" style={{ width: `${percent}%` }} />
              <span>신뢰도 {percent}%</span>
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
              {result.candidates.length > 0 && (
                <>
                  <dt>비슷한 후보 증상</dt>
                  <dd>
                    <ol className="candidates">
                      {result.candidates.map((c) => (
                        <li key={c.id} className={c.id === result.symptom.id ? 'picked' : ''}>
                          {c.population} · {c.name}
                        </li>
                      ))}
                    </ol>
                  </dd>
                </>
              )}
            </dl>
          </div>
        </details>

        <p className="hint">참고용 보조 도구이며 진단이 아닙니다.</p>
      </div>
    </article>
  );
}
