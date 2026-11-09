import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 사람 모델: Quaternius Universal Base Characters (CC0). 질감과 눈을 빼고 몸 메시와 뼈대만 남겼다
const model = (sex) => `${import.meta.env.BASE_URL}models/body-${sex}.glb`;
const DISTANCE = 4.4;
const TARGET = new THREE.Vector3(0, 0.9, 0);
const ARM_DOWN = 1.22; // T자로 벌린 팔을 몸 옆으로 내리는 각도 (라디안)

/** 뼈 이름(UE 마네킹 방식) → 몸 조각. _l은 그 사람의 왼쪽 */
function pieceOf(bone) {
  if (/Head|neck/.test(bone)) return 'head';
  if (/spine|clavicle/.test(bone)) return 'chest'; // 몸통. 가슴·배·어깨는 아래에서 높이로 다시 나눈다
  const side = bone.endsWith('_l') ? 'l' : bone.endsWith('_r') ? 'r' : null;
  if (!side) return 'belly'; // pelvis
  return `${/thigh|calf|foot|ball/.test(bone) ? 'leg' : 'arm'}_${side}`;
}
// 몸 조각 → [앞에서 누를 때, 뒤에서 누를 때] BodyMap의 큰 부위 id
const REGION = {
  head: ['머리', '머리'],
  chest: ['가슴', '등'],
  belly: ['배', '허리'],
  arm_r: ['오른쪽 팔', '오른쪽 팔'],
  arm_l: ['왼쪽 팔', '왼쪽 팔'],
  leg_r: ['오른쪽 다리', '오른쪽 다리'],
  leg_l: ['왼쪽 다리', '왼쪽 다리'],
};
const LABEL = { head: '머리', chest: '가슴 · 등', belly: '배 · 허리', arm_r: '오른쪽 팔', arm_l: '왼쪽 팔', leg_r: '오른쪽 다리', leg_l: '왼쪽 다리' };

/** 부모 공간에서 세계 축 기준으로 뼈를 돌린다 (뼈마다 축 방향이 달라도 같은 식으로 돌릴 수 있다) */
function rotateWorld(bone, axis, angle) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(parent.clone().invert().multiply(q).multiply(parent));
  bone.updateMatrixWorld(true);
}

/** 발밑의 흐린 그림자 */
function shadow() {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/**
 * 끌어서 돌려 보고 눌러서 고르는 3D 몸. 누른 곳의 큰 부위를 알려 주면, 세부 부위는 BodyMap의 2D 확대 그림에서 고른다
 * 모델을 바꾸려면 key를 바꿔 새로 그린다
 * @param {{sex: 'male'|'female', view: 'front'|'back', hot: Set<string>, onPick: (view: 'front'|'back', id: string) => void, onSide: (view: 'front'|'back') => void, onFail: () => void}} props
 *   hot: 고른 세부 부위가 있는 큰 부위 id, onSide: 돌려서 보이는 면이 바뀌었을 때, onFail: 3D를 그릴 수 없을 때 (2D로 대신한다)
 */
export default function Body3D({ sex, view, hot, onPick, onSide, onFail }) {
  const host = useRef(null);
  const tip = useRef(null);
  const scene = useRef(null);
  const latest = useRef({});
  const [ready, setReady] = useState(false);
  latest.current = { onPick, onSide, onFail, hot };

  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.error('[3D] WebGL을 쓸 수 없어 2D로 바꿉니다:', e);
      latest.current.onFail();
      return;
    }
    let disposed = false;
    const el = host.current;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.prepend(renderer.domElement);
    const css = (name) => getComputedStyle(el).getPropertyValue(name).trim();
    const base = new THREE.Color(css('--body-3d') || '#b8c1cc');
    const hover = base.clone().lerp(new THREE.Color('#ffffff'), 0.35);
    const hotColor = new THREE.Color(css('--danger-fill') || '#d92d20');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const world = new THREE.Scene();
    world.add(new THREE.HemisphereLight(0xffffff, 0x8a96a6, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 3, 2.5);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(-2, 1.5, -2.5);
    world.add(key, rim, shadow());

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 1.2;
    controls.maxPolarAngle = 1.9;
    controls.enableDamping = !reduce;
    const place = (angle) => {
      camera.position.set(Math.sin(angle) * DISTANCE, 0.95, Math.cos(angle) * DISTANCE);
      controls.update();
    };
    const state = { camera, controls, side: view, anim: null, hover: null, mesh: null, piece: null, colors: null };
    /** 지금 각도에서 목표 각도까지 부드럽게 돌린다 (가까운 쪽으로) */
    state.turn = (to, ms = 450) => {
      const from = controls.getAzimuthalAngle();
      const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
      state.anim = reduce ? null : { from, to: from + delta, start: performance.now(), ms };
      if (reduce) place(to);
    };
    place(view === 'back' ? Math.PI : -0.6);
    if (view !== 'back') state.turn(0, 900); // 처음 열 때 살짝 돌아오며 3D라는 걸 보여 준다
    scene.current = state;

    controls.addEventListener('start', () => (state.anim = null));
    // 돌려서 보이는 면이 바뀌면 앞·뒤 버튼도 따라 바꾼다
    controls.addEventListener('change', () => {
      const side = Math.abs(controls.getAzimuthalAngle()) > Math.PI / 2 ? 'back' : 'front';
      if (side !== state.side) {
        state.side = side;
        latest.current.onSide(side);
      }
    });

    new GLTFLoader().load(
      model(sex),
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        let mesh;
        root.traverse((o) => {
          if (o.isSkinnedMesh) mesh = o;
        });
        // 팔을 몸 옆으로 내린다
        const bone = (name) => mesh.skeleton.bones.find((b) => b.name === name);
        root.updateMatrixWorld(true);
        rotateWorld(bone('upperarm_l'), new THREE.Vector3(0, 0, 1), -ARM_DOWN);
        rotateWorld(bone('upperarm_r'), new THREE.Vector3(0, 0, 1), ARM_DOWN);
        mesh.frustumCulled = false;
        mesh.computeBoundingSphere();

        // 정점마다 가장 많이 붙은 뼈로 몸 조각을 정한다. 모델을 자르지 않고 이 값으로 고르고 칠한다
        const geo = mesh.geometry;
        const ji = geo.attributes.skinIndex;
        const jw = geo.attributes.skinWeight;
        const pos = geo.attributes.position; // 팔을 내리기 전(T자) 위치
        const names = mesh.skeleton.bones.map((b) => b.name);
        const byBone = Array.from({ length: ji.count }, (_, v) => {
          let top = 0;
          for (let k = 1; k < 4; k++) if (jw.getComponent(v, k) > jw.getComponent(v, top)) top = k;
          return pieceOf(names[ji.getComponent(v, top)]);
        });
        // 몸통은 2D 그림과 같은 높이에서 가슴과 배를 나눈다 (가슴 아래 끝이 키의 67.5%).
        // 겨드랑이보다 높고 위팔만큼 바깥인 몸통(어깨)은 팔로 넣는다. 2D 팔 그림에 '어깨'가 있다
        geo.computeBoundingBox();
        const height = geo.boundingBox.max.y;
        const arm = byBone.flatMap((p, v) => (p.startsWith('arm') ? [v] : []));
        const armpit = Math.min(...arm.map((v) => pos.getY(v)));
        const shoulder = Math.min(...arm.map((v) => Math.abs(pos.getX(v)))) * 0.9;
        state.piece = byBone.map((p, v) => {
          if (p !== 'chest' && p !== 'belly') return p;
          const [x, y] = [pos.getX(v), pos.getY(v)];
          if (y > armpit && Math.abs(x) > shoulder) return x > 0 ? 'arm_l' : 'arm_r';
          return y >= height * 0.675 ? 'chest' : 'belly';
        });
        state.colors = new THREE.BufferAttribute(new Float32Array(ji.count * 3), 3);
        geo.setAttribute('color', state.colors);
        mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
        state.mesh = mesh;
        world.add(root);
        setReady(true);
      },
      undefined,
      (e) => {
        console.error('[3D] 몸 모델을 불러오지 못해 2D로 바꿉니다:', e);
        if (!disposed) latest.current.onFail();
      },
    );

    // 끌기와 누르기를 움직인 거리로 나눈다
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = null;
    const hit = (e) => {
      if (!state.mesh) return null;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const h = ray.intersectObject(state.mesh)[0];
      return h && { piece: state.piece[h.face.a], back: h.face.normal.z < 0 };
    };
    const onDown = (e) => (down = [e.clientX, e.clientY]);
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const h = hit(e);
      if (h) latest.current.onPick(h.back ? 'back' : 'front', REGION[h.piece][h.back ? 1 : 0]);
    };
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const h = e.buttons ? null : hit(e);
      state.hover = h?.piece ?? null;
      renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
      if (tip.current) {
        tip.current.hidden = !h;
        if (h) {
          const r = el.getBoundingClientRect();
          tip.current.textContent = h.piece === 'chest' || h.piece === 'belly' ? REGION[h.piece][h.back ? 1 : 0] : LABEL[h.piece];
          tip.current.style.transform = `translate(${e.clientX - r.left + 12}px, ${e.clientY - r.top - 28}px)`;
        }
      }
    };
    const onLeave = () => {
      state.hover = null;
      if (tip.current) tip.current.hidden = true;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const pulseColor = new THREE.Color();
    let frame;
    const loop = (now) => {
      if (state.anim) {
        const k = Math.min(1, (now - state.anim.start) / state.anim.ms);
        place(state.anim.from + (state.anim.to - state.anim.from) * (1 - (1 - k) ** 3));
        if (k === 1) state.anim = null;
      }
      // 고른 부위는 빨갛게 (천천히 밝아졌다 어두워진다), 마우스를 올린 부위는 밝게
      if (state.mesh) {
        const { hot: chosen } = latest.current;
        const on = (p) => chosen.has(REGION[p][0]) || chosen.has(REGION[p][1]);
        pulseColor.copy(hotColor).lerp(new THREE.Color('#ffffff'), reduce ? 0 : 0.12 + 0.12 * Math.sin(now / 250));
        const arr = state.colors.array;
        for (let v = 0; v < state.piece.length; v++) {
          const p = state.piece[v];
          const c = on(p) ? pulseColor : p === state.hover ? hover : base;
          arr[v * 3] = c.r;
          arr[v * 3 + 1] = c.g;
          arr[v * 3 + 2] = c.b;
        }
        state.colors.needsUpdate = true;
      }
      controls.update();
      renderer.render(world, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      world.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      scene.current = null;
    };
  }, []);

  // 앞·뒤 버튼을 누르면 그 면으로 돌린다 (돌려서 바뀐 경우는 이미 그 면이다)
  useEffect(() => {
    const s = scene.current;
    if (!s || s.side === view) return;
    s.side = view;
    s.turn(view === 'back' ? Math.PI : 0);
  }, [view]);

  return (
    <div ref={host} className="body3d" role="img" aria-label="돌려 볼 수 있는 3D 몸 그림. 아픈 곳을 누르면 크게 보여요. 아래 부위 버튼으로도 고를 수 있어요">
      {!ready && <span className="body3d-wait">3D 몸을 불러오는 중…</span>}
      <span ref={tip} className="body3d-tip" hidden />
    </div>
  );
}
