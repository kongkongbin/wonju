import { useState } from 'react';
import { painSentence } from '../lib/triage/body.js';
import { BodyIcon } from './icons.jsx';

// 앞모습 그림의 부위. 마주 본 모습이라 화면 왼쪽이 그 사람의 오른쪽이다
const FRONT = [
  { name: '머리', shape: <circle cx="100" cy="32" r="26" /> },
  { name: '목', shape: <rect x="80" y="58" width="40" height="22" rx="6" /> },
  { name: '가슴', shape: <rect x="62" y="80" width="76" height="60" rx="14" /> },
  { name: '윗배', shape: <rect x="66" y="142" width="68" height="36" rx="6" /> },
  { name: '아랫배', shape: <rect x="66" y="180" width="68" height="40" rx="12" /> },
  { name: '오른쪽 팔', shape: <rect x="26" y="80" width="32" height="132" rx="14" /> },
  { name: '왼쪽 팔', shape: <rect x="142" y="80" width="32" height="132" rx="14" /> },
  { name: '오른쪽 다리', shape: <rect x="64" y="224" width="34" height="132" rx="14" /> },
  { name: '왼쪽 다리', shape: <rect x="102" y="224" width="34" height="132" rx="14" /> },
];
const OTHERS = ['등', '허리', '온몸'];

/**
 * 말하기 어려울 때 아픈 곳을 눌러 고르는 그림. 고른 곳은 입력창의 문장이 되어 고치거나 말로 덧붙일 수 있다
 * @param {{onChange: (sentence: string) => void, onSubmit: (sentence: string) => void}} props
 */
export default function BodyMap({ onChange, onSubmit }) {
  const [parts, setParts] = useState([]);
  const [child, setChild] = useState(false);
  const sentence = painSentence(parts, child);

  function update(nextParts, nextChild) {
    setParts(nextParts);
    setChild(nextChild);
    onChange(painSentence(nextParts, nextChild));
  }

  const toggle = (name) => update(parts.includes(name) ? parts.filter((p) => p !== name) : [...parts, name], child);

  return (
    <details className="body-map">
      <summary>
        <BodyIcon />
        말하기 어려우면 아픈 곳 고르기
      </summary>
      <div className="body-map-content">
        <label className="child-check">
          <input type="checkbox" checked={child} onChange={(e) => update(parts, e.target.checked)} />
          아이가 아파요
        </label>
        <div className="figure">
          <span className="figure-side" aria-hidden="true">
            오른쪽
          </span>
          <svg viewBox="0 0 200 360" role="group" aria-label="아픈 곳을 고르는 몸 그림">
            {FRONT.map(({ name, shape }) => (
              <g
                key={name}
                className={parts.includes(name) ? 'body-part on' : 'body-part'}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-pressed={parts.includes(name)}
                onClick={() => toggle(name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(name);
                  }
                }}
              >
                {shape}
              </g>
            ))}
          </svg>
          <span className="figure-side" aria-hidden="true">
            왼쪽
          </span>
        </div>
        <div className="chips">
          {OTHERS.map((name) => (
            <button key={name} type="button" className={parts.includes(name) ? 'chip on' : 'chip'} aria-pressed={parts.includes(name)} onClick={() => toggle(name)}>
              {name}
            </button>
          ))}
        </div>
        {sentence ? (
          <button type="button" className="action" onClick={() => onSubmit(sentence)}>
            "{sentence}"로 판정받기
          </button>
        ) : (
          <p className="hint">그림이나 버튼을 눌러 주세요. 여러 곳을 골라도 됩니다.</p>
        )}
      </div>
    </details>
  );
}
