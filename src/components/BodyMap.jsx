import { useState } from 'react';
import { PAIN_FEELS, PAIN_SCORES, PAIN_SINCE, painSentence } from '../lib/triage/body.js';
import { BodyIcon } from './icons.jsx';

// 좌표는 viewBox 200×360 기준. 앞모습은 마주 본 모습이라 화면 왼쪽이 그 사람의 오른쪽, 뒷모습은 화면 왼쪽이 그 사람의 왼쪽이다
const rect = (x, y, w, h, rx = 6) => ({ x, y, w, h, rx });
const circle = (cx, cy, r) => ({ cx, cy, r });
const ellipse = (cx, cy, rx, ry) => ({ cx, cy, rx, ry, ellipse: true });
const part = (name, ...shapes) => ({ name, shapes });

function Shape({ s }) {
  if (s.ellipse) return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
  if (s.r) return <circle cx={s.cx} cy={s.cy} r={s.r} />;
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />;
}

const HEAD = { id: '머리', name: '머리', box: [64, 2, 72, 80], base: [circle(100, 32, 26), rect(80, 58, 40, 22)] };

function arm(side, x) {
  const rows = [['어깨', 80, 22], ['위팔', 104, 36], ['팔꿈치', 142, 14], ['아래팔', 158, 34], ['손', 194, 18]];
  return { id: `${side} 팔`, name: `${side} 팔`, box: [x - 8, 76, 48, 140], base: [rect(x, 80, 32, 132, 14)], parts: rows.map(([n, y, h]) => part(`${side} ${n}`, rect(x, y, 32, h, 8))) };
}

function leg(side, x, back) {
  const rows = back
    ? [['허벅지', 224, 60], ['무릎 뒤', 286, 16], ['종아리', 304, 34], ['발뒤꿈치', 340, 16]]
    : [['사타구니', 224, 16], ['허벅지', 242, 44], ['무릎', 288, 16], ['정강이', 306, 32], ['발', 340, 16]];
  return { id: `${side} 다리`, name: `${side} 다리`, box: [x - 6, 220, 46, 140], base: [rect(x, 224, 34, 132, 14)], parts: rows.map(([n, y, h]) => part(`${side} ${n}`, rect(x, y, 34, h))) };
}

// 큰 부위를 누르면 그 부위로 확대되고, 확대한 뒤에 세부 부위를 고른다. 배는 4분면처럼 나눠 아픈 위치가 판정에 드러나게 한다
const VIEWS = {
  front: [
    { ...HEAD, parts: [part('이마', rect(82, 10, 36, 12, 4)), part('눈', ellipse(90, 29, 7, 4), ellipse(110, 29, 7, 4)), part('코', rect(96, 33, 8, 10, 3)), part('귀', rect(70, 24, 6, 14, 3), rect(124, 24, 6, 14, 3)), part('입·턱', rect(86, 45, 28, 11, 5)), part('목', rect(80, 60, 40, 20))] },
    { id: '가슴', name: '가슴', box: [56, 76, 88, 68], base: [rect(62, 80, 76, 60, 14)], parts: [part('오른쪽 가슴', rect(64, 84, 27, 52, 8)), part('가슴 가운데', rect(93, 84, 14, 52, 5)), part('왼쪽 가슴', rect(109, 84, 27, 52, 8))] },
    {
      id: '배',
      name: '배',
      box: [60, 138, 80, 86],
      base: [rect(66, 142, 68, 36), rect(66, 180, 68, 40, 12)],
      parts: [
        part('오른쪽 윗배', rect(67, 143, 21, 34, 5)),
        part('명치', rect(90, 143, 20, 34, 5)),
        part('왼쪽 윗배', rect(112, 143, 21, 34, 5)),
        part('오른쪽 아랫배', rect(67, 181, 21, 38, 8)),
        part('배꼽 주위', rect(90, 181, 20, 17, 5)),
        part('아랫배 가운데', rect(90, 200, 20, 19, 5)),
        part('왼쪽 아랫배', rect(112, 181, 21, 38, 8)),
      ],
    },
    arm('오른쪽', 26),
    arm('왼쪽', 142),
    leg('오른쪽', 64),
    leg('왼쪽', 102),
  ],
  back: [
    { ...HEAD, parts: [part('뒷머리', circle(100, 32, 24)), part('목 뒤', rect(80, 60, 40, 20))] },
    { id: '등', name: '등', box: [56, 76, 88, 78], base: [rect(62, 80, 76, 70, 14)], parts: [part('등 위쪽', rect(64, 84, 72, 30, 8)), part('등 가운데', rect(64, 116, 72, 32, 8))] },
    { id: '허리', name: '허리', box: [60, 148, 80, 78], base: [rect(66, 152, 68, 70, 12)], parts: [part('왼쪽 옆구리', rect(67, 153, 21, 36)), part('허리 가운데', rect(90, 153, 20, 36, 5)), part('오른쪽 옆구리', rect(112, 153, 21, 36)), part('엉덩이', rect(67, 191, 66, 30, 10))] },
    arm('왼쪽', 26),
    arm('오른쪽', 142),
    leg('왼쪽', 64, true),
    leg('오른쪽', 102, true),
  ],
};

const zoomScale = (box) => (box ? Math.min(200 / box[2], 360 / box[3]) * 0.9 : 1);

/** 확대할 부위가 그림 가운데에 꽉 차게 옮긴다 (CSS transition으로 움직인다) */
function zoomStyle(box) {
  if (!box) return { transform: 'translate(0px, 0px) scale(1)' };
  const [x, y, w, h] = box;
  const s = zoomScale(box);
  return { transform: `translate(${100 - (x + w / 2) * s}px, ${180 - (y + h / 2) * s}px) scale(${s})` };
}

/** 확대한 칸 안에 부위 이름을 쓴다. 팔다리는 좌우를 빼고, 띄어쓰기마다 줄을 바꾼다 */
function PartLabel({ p, scale }) {
  const s = p.shapes[0];
  const [cx, cy] = s.r || s.ellipse ? [s.cx, s.cy] : [s.x + s.w / 2, s.y + s.h / 2];
  const size = 9 / scale; // 확대해도 화면에서 약 9px
  const lines = p.name.replace(/^(오른쪽|왼쪽) (?=.*(어깨|팔|손|사타구니|허벅지|무릎|정강이|종아리|발))/, '').split(' ');
  return (
    <text x={cx} y={cy - ((lines.length - 1) * size * 1.15) / 2} fontSize={size} className="part-label" textAnchor="middle" dominantBaseline="middle">
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
 * @param {{onChange: (sentence: string) => void, onSubmit: (sentence: string) => void}} props
 */
export default function BodyMap({ onChange, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('front');
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

  return (
    <details className="body-map" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <BodyIcon />
        말하기 어려우면 아픈 곳 고르기
      </summary>
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
          <svg viewBox="0 0 200 360" className={region ? 'zoomed' : ''} role="group" aria-label={`아픈 곳을 고르는 몸 그림, ${view === 'front' ? '앞' : '뒤'}모습`}>
            <g className="zoomer" style={zoomStyle(region?.box)}>
              {regions.map((r) => (
                <g key={r.id} className={!region ? 'region' : r === region ? 'region current' : 'region dim'} {...(!region && pressable(`${r.name} 크게 보기`, () => setZoom(r.id)))}>
                  {r.base.map((s, i) => (
                    <Shape key={i} s={s} />
                  ))}
                </g>
              ))}
              {regions.flatMap((r) =>
                r.parts.map((p) => {
                  const on = parts.includes(p.name);
                  const active = r === region;
                  if (!on && !active) return null;
                  return (
                    <g key={`${r.id}/${p.name}`} className={on ? 'body-part on' : 'body-part'} {...(active ? pressable(p.name, () => toggle(p.name), on) : { 'aria-hidden': true })}>
                      {p.shapes.map((s, i) => (
                        <Shape key={i} s={s} />
                      ))}
                      {active && <PartLabel p={p} scale={zoomScale(region.box)} />}
                    </g>
                  );
                }),
              )}
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
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          접기
        </button>
      </div>
    </details>
  );
}
