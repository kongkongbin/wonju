import { useEffect, useRef, useState } from 'react';
import { PAIN_FEELS, PAIN_SCORES, PAIN_SINCE, painSentence } from '../lib/triage/body.js';
import { ARM_LEFT_SIDE, ARM_RIGHT_SIDE, CHEST, HEAD, LEG_LEFT_SIDE, LEG_RIGHT_SIDE, LOWER_ABDOMEN, NECK, UPPER_ABDOMEN } from './bodyShapes.js';
import { PhoneIcon } from './icons.jsx';

// 좌표는 실루엣(bodyShapes.js)과 같은 800×900 기준이고, 그림에는 몸이 있는 부분만 보여 준다.
// 앞모습은 마주 본 모습이라 화면 왼쪽이 그 사람의 오른쪽, 뒷모습은 화면 왼쪽이 그 사람의 왼쪽이다
const VIEW = { x: 222, y: 36, w: 360, h: 828 };
const rect = (x, y, w, h, rx = 0) => ({ x, y, w, h, rx });
const ellipse = (cx, cy, rx, ry) => ({ cx, cy, rx, ry, ellipse: true });
const path = (d) => ({ d });
const poly = (points) => ({ points });
/** at: 이름을 쓸 자리. 없으면 첫 도형의 가운데 */
const part = (name, shapes, at) => ({ name, shapes: Array.isArray(shapes) ? shapes : [shapes], at });

function Shape({ s }) {
  if (s.d) return <path d={s.d} />;
  if (s.points) return <polygon points={s.points} />;
  if (s.ellipse) return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />;
}

// 세부 부위는 실루엣 위에 띠나 칸을 놓고 큰 부위 모양으로 잘라서(clipPath) 실제 몸 모양 안에서 나뉘어 보이게 한다
const mirror = ([x, y]) => [800 - x, y];

function arm(side, d, screenLeft) {
  const rows = [
    ['어깨', 177, 228, [322, 200]],
    ['위팔', 228, 300, [305, 262]],
    ['팔꿈치', 300, 332, [298, 316]],
    ['아래팔', 332, 440, [283, 386]],
    ['손', 440, 524, [258, 482]],
  ];
  const x = screenLeft ? 224 : 450;
  return {
    id: `${side} 팔`,
    name: `${side} 팔`,
    box: [x, 170, 128, 358],
    base: [path(d)],
    parts: rows.map(([n, y0, y1, at]) => part(`${side} ${n}`, rect(x, y0, 128, y1 - y0), screenLeft ? at : mirror(at))),
  };
}

function leg(side, d, screenLeft, back) {
  const rows = back
    ? [
        ['허벅지', 456, 650, [356, 565]],
        ['무릎 뒤', 650, 700, [358, 675]],
        ['종아리', 700, 815, [360, 758]],
        ['발뒤꿈치', 815, 862, [372, 838]],
      ]
    : [
        ['사타구니', 456, 528, [362, 498]],
        ['허벅지', 528, 650, [355, 588]],
        ['무릎', 650, 700, [358, 675]],
        ['정강이', 700, 815, [360, 758]],
        ['발', 815, 862, [372, 838]],
      ];
  const x = screenLeft ? 308 : 398;
  return {
    id: `${side} 다리`,
    name: `${side} 다리`,
    box: [x, 454, 96, 410],
    base: [path(d)],
    parts: rows.map(([n, y0, y1, at]) => part(`${side} ${n}`, rect(x, y0, 96, y1 - y0), screenLeft ? at : mirror(at))),
  };
}

const HEAD_REGION = { id: '머리', name: '머리', box: [342, 38, 118, 160], base: [path(HEAD), path(NECK)] };
const TORSO_BOX = [310, 303, 180, 216];

// 큰 부위를 누르면 그 부위로 확대되고, 확대한 뒤에 세부 부위를 고른다. 배는 칸을 나눠 아픈 위치가 판정에 드러나게 한다
const VIEWS = {
  front: [
    {
      ...HEAD_REGION,
      parts: [
        part('이마', rect(374, 56, 53, 20, 4)),
        part('눈', [ellipse(386, 88, 9, 5), ellipse(415, 88, 9, 5)], [400, 88]),
        part('코', rect(394, 93, 13, 14, 3)),
        part('귀', [rect(351, 94, 11, 22, 3), rect(439, 94, 11, 22, 3)], [356, 124]),
        part('입·턱', rect(381, 112, 39, 24, 6)),
        part('목', path(NECK), [400, 172]),
      ],
    },
    {
      id: '가슴',
      name: '가슴',
      box: [322, 180, 156, 132],
      base: [poly(CHEST)],
      parts: [part('오른쪽 가슴', rect(325, 182, 55, 130)), part('가슴 가운데', rect(380, 182, 41, 130)), part('왼쪽 가슴', rect(421, 182, 55, 130))],
    },
    {
      id: '배',
      name: '배',
      box: TORSO_BOX,
      base: [path(UPPER_ABDOMEN), path(LOWER_ABDOMEN)],
      parts: [
        part('오른쪽 윗배', rect(325, 307, 52, 91)),
        part('명치', rect(377, 307, 47, 91)),
        part('왼쪽 윗배', rect(424, 307, 52, 91)),
        part('오른쪽 아랫배', rect(312, 398, 65, 118), [355, 440]),
        part('배꼽 주위', rect(377, 398, 47, 40)),
        part('아랫배 가운데', rect(377, 438, 47, 78), [400, 470]),
        part('왼쪽 아랫배', rect(424, 398, 65, 118), [445, 440]),
      ],
    },
    arm('오른쪽', ARM_LEFT_SIDE, true),
    arm('왼쪽', ARM_RIGHT_SIDE, false),
    leg('오른쪽', LEG_LEFT_SIDE, true),
    leg('왼쪽', LEG_RIGHT_SIDE, false),
  ],
  back: [
    { ...HEAD_REGION, parts: [part('뒷머리', path(HEAD), [400, 92]), part('목 뒤', path(NECK), [400, 172])] },
    {
      id: '등',
      name: '등',
      box: [322, 180, 156, 132],
      base: [poly(CHEST)],
      parts: [part('등 위쪽', rect(325, 182, 150, 62), [400, 220]), part('등 가운데', rect(325, 244, 150, 68), [400, 278])],
    },
    {
      id: '허리',
      name: '허리',
      box: TORSO_BOX,
      base: [path(UPPER_ABDOMEN), path(LOWER_ABDOMEN)],
      parts: [part('왼쪽 옆구리', rect(312, 307, 65, 93), [354, 352]), part('허리 가운데', rect(377, 307, 47, 93)), part('오른쪽 옆구리', rect(424, 307, 65, 93), [446, 352]), part('엉덩이', rect(312, 400, 177, 116), [400, 450])],
    },
    arm('왼쪽', ARM_LEFT_SIDE, true),
    arm('오른쪽', ARM_RIGHT_SIDE, false),
    leg('왼쪽', LEG_LEFT_SIDE, true, true),
    leg('오른쪽', LEG_RIGHT_SIDE, false, true),
  ],
};

const zoomScale = (box) => (box ? Math.min(VIEW.w / box[2], VIEW.h / box[3]) * 0.9 : 1);

/** 확대할 부위가 그림 가운데에 꽉 차게 옮긴다 (CSS transition으로 움직인다) */
function zoomStyle(box) {
  if (!box) return { transform: 'translate(0px, 0px) scale(1)' };
  const [x, y, w, h] = box;
  const s = zoomScale(box);
  const [cx, cy] = [VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2];
  return { transform: `translate(${cx - (x + w / 2) * s}px, ${cy - (y + h / 2) * s}px) scale(${s})` };
}

/** 확대한 칸 위에 부위 이름을 쓴다. 팔다리는 좌우를 빼고, 띄어쓰기마다 줄을 바꾼다 */
function PartLabel({ p, scale, on }) {
  const s = p.shapes[0];
  const [cx, cy] = p.at ?? (s.ellipse ? [s.cx, s.cy] : [s.x + s.w / 2, s.y + s.h / 2]);
  const size = 16 / scale; // 확대해도 화면에서 약 11px
  const lines = p.name.replace(/^(오른쪽|왼쪽) (?=.*(어깨|팔|손|사타구니|허벅지|무릎|정강이|종아리|발))/, '').split(' ');
  return (
    <text x={cx} y={cy - ((lines.length - 1) * size * 1.15) / 2} fontSize={size} className={on ? 'part-label on' : 'part-label'} textAnchor="middle" dominantBaseline="middle">
      {lines.map((line, i) => (
        <tspan key={i} x={cx} dy={i ? size * 1.15 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const SCORE_FACES = [
  ['🙂', '조금'],
  ['😣', '꽤'],
  ['😫', '아주 심하게'],
];

/** Enter·Space로도 누를 수 있게 한다 */
const pressable = (label, onPress, pressed) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  'aria-pressed': pressed,
  onClick: onPress,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPress();
    }
  },
});

/**
 * 말하기 어려울 때 아픈 곳을 눌러 고르는 그림. 고른 곳과 통증은 입력창의 문장이 되어 고치거나 말로 덧붙일 수 있다
 * 전체 화면으로 열고, 닫아도 고른 내용은 남는다
 * @param {{open: boolean, onClose: () => void, onChange: (sentence: string) => void, onSubmit: (sentence: string) => void}} props onClose: 이전으로 (폰 뒤로가기와 같은 길)
 */
export default function BodyMap({ open, onClose, onChange, onSubmit }) {
  const backRef = useRef(null);
  const [view, setView] = useState('front');

  useEffect(() => {
    if (!open) return;
    backRef.current?.focus();
    document.body.style.overflow = 'hidden'; // 뒤의 첫 화면이 같이 스크롤되지 않게
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const [zoom, setZoom] = useState(null); // 확대한 큰 부위 id
  const [parts, setParts] = useState([]);
  const [child, setChild] = useState(false);
  const [pain, setPain] = useState({}); // { score, feel, since }
  const sentence = painSentence(parts, child, pain);

  function update(next) {
    const s = { parts, child, pain, ...next };
    setParts(s.parts);
    setChild(s.child);
    setPain(s.pain);
    onChange(painSentence(s.parts, s.child, s.pain));
  }

  const toggle = (name) => update({ parts: parts.includes(name) ? parts.filter((p) => p !== name) : [...parts, name] });
  const choose = (key, value) => update({ pain: { ...pain, [key]: pain[key] === value ? undefined : value } });
  const chip = (name, label = name) => (
    <button key={name} type="button" className={parts.includes(name) ? 'chip on' : 'chip'} aria-pressed={parts.includes(name)} onClick={() => toggle(name)}>
      {label}
    </button>
  );

  const regions = VIEWS[view];
  const region = regions.find((r) => r.id === zoom);
  const [leftSide, rightSide] = view === 'front' ? ['오른쪽', '왼쪽'] : ['왼쪽', '오른쪽'];

  function turn(next) {
    setZoom(null);
    setView(next);
  }

  if (!open) return null;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="body-map-title">
      <header className="top">
        <button ref={backRef} type="button" className="ghost back" onClick={onClose}>
          ← 이전으로
        </button>
        <h2 id="body-map-title" className="sheet-title">
          아픈 곳 고르기
        </h2>
        <a className="call" href="tel:119" aria-label="119에 전화하기">
          <PhoneIcon size={18} />
          119
        </a>
      </header>
      <div className="body-map-content">
        <div className="body-map-bar">
          <div className="seg view-switch" role="group" aria-label="몸 방향">
            {[
              ['front', '앞'],
              ['back', '뒤'],
            ].map(([v, label]) => (
              <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => turn(v)}>
                {label}
              </button>
            ))}
          </div>
          <label className="child-check">
            <input type="checkbox" checked={child} onChange={(e) => update({ child: e.target.checked })} />
            아이가 아파요
          </label>
        </div>
        <p className="hint">{region ? `${region.name}에서 아픈 곳을 눌러 주세요. 여러 곳을 골라도 됩니다.` : '아픈 부위를 누르면 크게 보여요.'}</p>

        {/* 앞뒤를 바꿀 때마다 새로 그려서 뒤집히는 움직임을 준다 */}
        <div className="figure flip" key={view}>
          <span className="figure-side" aria-hidden="true">
            {leftSide}
          </span>
          <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className={region ? 'zoomed' : ''} role="group" aria-label={`아픈 곳을 고르는 몸 그림, ${view === 'front' ? '앞' : '뒤'}모습`}>
            <defs>
              {regions.map((r, i) => (
                <clipPath key={r.id} id={`body-clip-${view}-${i}`}>
                  {r.base.map((s, j) => (
                    <Shape key={j} s={s} />
                  ))}
                </clipPath>
              ))}
            </defs>
            <g className="zoomer" style={zoomStyle(region?.box)}>
              {regions.map((r) => (
                <g key={r.id} className={!region ? 'region' : r === region ? 'region current' : 'region dim'} {...(!region && pressable(`${r.name} 크게 보기`, () => setZoom(r.id)))}>
                  {r.base.map((s, i) => (
                    <Shape key={i} s={s} />
                  ))}
                </g>
              ))}
              {regions.flatMap((r, i) =>
                r.parts.map((p) => {
                  const on = parts.includes(p.name);
                  const active = r === region;
                  if (!on && !active) return null;
                  return (
                    <g
                      key={`${r.id}/${p.name}`}
                      className={on ? 'body-part on' : 'body-part'}
                      clipPath={`url(#body-clip-${view}-${i})`}
                      {...(active ? pressable(p.name, () => toggle(p.name), on) : { 'aria-hidden': true })}
                    >
                      {p.shapes.map((s, j) => (
                        <Shape key={j} s={s} />
                      ))}
                    </g>
                  );
                }),
              )}
              {/* 이름은 잘리지 않게 자른 칸 밖에서 따로 쓴다 */}
              {region?.parts.map((p) => (
                <PartLabel key={p.name} p={p} scale={zoomScale(region.box)} on={parts.includes(p.name)} />
              ))}
            </g>
          </svg>
          <span className="figure-side" aria-hidden="true">
            {rightSide}
          </span>
        </div>

        {region ? (
          <>
            <div className="chips">
              {region.parts.map((p) => chip(p.name))}
              {chip(region.name, `${region.name} 전체`)}
            </div>
            <button type="button" className="ghost" onClick={() => setZoom(null)}>
              ← 몸 전체 보기
            </button>
          </>
        ) : (
          <div className="chips">
            {chip('온몸')}
            {parts
              .filter((p) => p !== '온몸')
              .map((p) => (
                <button key={p} type="button" className="chip on" onClick={() => toggle(p)} aria-label={`${p} 빼기`}>
                  {p} ×
                </button>
              ))}
          </div>
        )}

        {parts.length > 0 && (
          <div className="checklist">
            <fieldset className="check-item">
              <legend>얼마나 아파요?</legend>
              <div className="seg pain-scale">
                {PAIN_SCORES.map((score, i) => (
                  <button key={score} type="button" className={pain.score === score ? `on pain-${i + 1}` : `pain-${i + 1}`} aria-pressed={pain.score === score} onClick={() => choose('score', score)}>
                    <span className="face" aria-hidden="true">
                      {SCORE_FACES[i][0]}
                    </span>
                    {SCORE_FACES[i][1]}
                    <small>{score}점</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="check-item">
              <legend>어떻게 아파요?</legend>
              <div className="seg">
                {Object.keys(PAIN_FEELS).map((feel) => (
                  <button key={feel} type="button" className={pain.feel === feel ? 'on' : ''} aria-pressed={pain.feel === feel} onClick={() => choose('feel', feel)}>
                    {feel}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="check-item">
              <legend>언제부터요?</legend>
              <div className="seg">
                {PAIN_SINCE.map((since) => (
                  <button key={since} type="button" className={pain.since === since ? 'on' : ''} aria-pressed={pain.since === since} onClick={() => choose('since', since)}>
                    {since}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {sentence ? (
          <button type="button" className="action" onClick={() => onSubmit(sentence)}>
            "{sentence}"로 판정받기
          </button>
        ) : (
          <p className="hint">그림이나 버튼을 눌러 주세요.</p>
        )}
      </div>
    </div>
  );
}
