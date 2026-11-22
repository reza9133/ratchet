// Interactive 3D ratchet wheel (three.js). The wheel turns one tooth at a time in ONE direction; the pawl blocks the other.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const TIER_COLORS = [0x12b5a0, 0x2f5bff, 0x7b2cff, 0xe0148c];
const N = 12, STEP = (Math.PI * 2) / N;
const deg = (d) => (d * Math.PI) / 180;

function gearShape(Rt = 1, Rr = 0.835) {
  const s = new THREE.Shape();
  const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  for (let i = 0; i < N; i += 1) {
    const a0 = i * STEP;
    const p1 = pt(Rr, a0), p2 = pt(Rt, a0 + deg(20.5)), p3 = pt(Rt, a0 + deg(24.5)), p4 = pt(Rr, a0 + deg(25.5));
    if (i === 0) s.moveTo(...p1); else s.lineTo(...p1);
    s.lineTo(...p2); s.absarc(0, 0, Rt, a0 + deg(20.5), a0 + deg(24.5), false); s.lineTo(...p4);
    s.absarc(0, 0, Rr, a0 + deg(25.5), a0 + STEP, false);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.42, 0, Math.PI * 2, true); s.holes.push(hole);
  return s;
}

export function mountGear(canvas, { onTierChange } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50); camera.position.set(0.0, 0.1, 6.4);
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x19e6d4, 14, 12); rim.position.set(-3, -1.5, 2.5); scene.add(rim);

  const root = new THREE.Group(); scene.add(root);
  root.rotation.set(-0.18, 0.38, 0);

  // wheel
  const wheelGroup = new THREE.Group(); root.add(wheelGroup);
  const geo = new THREE.ExtrudeGeometry(gearShape(), { depth: 0.38, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -0.19);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x1a18ff, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
  const wheel = new THREE.Mesh(geo, bodyMat); wheelGroup.add(wheel);
  // hub disc + chevron (does not turn with the teeth: it is the "tier dial")
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x07070f, metalness: 0.4, roughness: 0.35 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 48), hubMat); hub.rotation.x = Math.PI / 2; wheelGroup.add(hub);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 16, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7b7bff, emissiveIntensity: 0.6, roughness: 0.3 })); halo.position.z = 0.17; wheelGroup.add(halo);
  const chevMat = new THREE.MeshStandardMaterial({ color: 0x19e6d4, emissive: 0x19e6d4, emissiveIntensity: 1.4, roughness: 0.3 });
  const chevron = new THREE.Group(); root.add(chevron);
  [-0.06, -0.24].forEach((y, k) => {
    const sh = new THREE.Shape(); sh.moveTo(-0.24, y); sh.lineTo(0, y + 0.22); sh.lineTo(0.24, y); sh.lineTo(0.24, y - 0.07); sh.lineTo(0, y + 0.15); sh.lineTo(-0.24, y - 0.07); sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), k ? chevMat.clone() : chevMat);
    if (k) { m.material.transparent = true; m.material.opacity = 0.45; } m.position.z = 0.2; m.position.y = 0.1; chevron.add(m);
  });

  // pawl (a lever resting on the root circle at the top of the wheel)
  const pawlPivot = new THREE.Group(); pawlPivot.position.set(1.18, 1.18, 0); root.add(pawlPivot);
  const pawlShape = new THREE.Shape(); pawlShape.moveTo(0, 0.07); pawlShape.lineTo(-0.82, -0.2); pawlShape.lineTo(-0.9, -0.34); pawlShape.lineTo(-0.7, -0.3); pawlShape.lineTo(0, -0.07); pawlShape.closePath();
  const pawl = new THREE.Mesh(new THREE.ExtrudeGeometry(pawlShape, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }),
    new THREE.MeshPhysicalMaterial({ color: 0x19e6d4, metalness: 0.5, roughness: 0.25, clearcoat: 1 }));
  pawl.position.z = -0.13; pawlPivot.add(pawl);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 32), new THREE.MeshStandardMaterial({ color: 0x07070f, metalness: 0.6, roughness: 0.3 })); pin.rotation.x = Math.PI / 2; pawlPivot.add(pin);
  pawlPivot.rotation.z = deg(-2);

  // tier rings behind the wheel
  const rings = TIER_COLORS.map((c, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.22 + i * 0.16, 0.035, 12, 120), new THREE.MeshStandardMaterial({ color: 0xaeb4d8, emissive: c, emissiveIntensity: 0, roughness: 0.4, metalness: 0.3 }));
    m.position.z = -0.32 - i * 0.04; root.add(m); return m;
  });

  // dust / validators
  const dots = new THREE.Group(); root.add(dots);
  for (let i = 0; i < 26; i += 1) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.03, 10, 10), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x7b7bff : 0x19e6d4 }));
    const a = Math.random() * Math.PI * 2, r = 1.9 + Math.random() * 0.7; d.position.set(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 1.2); d.userData = { a, r, s: 0.1 + Math.random() * 0.3 }; dots.add(d);
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minPolarAngle = Math.PI * 0.32; controls.maxPolarAngle = Math.PI * 0.68; controls.minAzimuthAngle = -0.7; controls.maxAzimuthAngle = 0.7;
  controls.target.set(0.15, 0.1, 0);

  // ---- state / animation ------------------------------------------------------------------------
  let tier = 1, anim = null, wheelAngle = 0;
  const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
  const refreshRings = () => rings.forEach((r, i) => { r.material.emissiveIntensity = i < tier ? 1.6 : 0; r.material.color.set(i < tier ? TIER_COLORS[i] : 0xaeb4d8); });
  refreshRings();

  function step() {
    if (anim) return false;
    if (tier >= 4) { blocked('top'); return false; }
    tier += 1; refreshRings(); onTierChange?.(tier);
    anim = { t0: performance.now(), dur: 620, from: wheelAngle, to: wheelAngle - STEP, kind: 'step' };
    return true;
  }
  function blocked(kind = 'back') {
    if (anim) return;
    anim = { t0: performance.now(), dur: 520, from: wheelAngle, to: wheelAngle, kind: 'blocked' };
  }
  function reset() { tier = 1; refreshRings(); onTierChange?.(tier); anim = { t0: performance.now(), dur: 700, from: wheelAngle, to: 0, kind: 'reset' }; }

  let last = performance.now(), running = true, visible = true;
  const resize = () => {
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let pawlLift = 0, shake = 0;
    if (anim) {
      const p = Math.min(1, (now - anim.t0) / anim.dur);
      if (anim.kind === 'step') { wheelAngle = anim.from + (anim.to - anim.from) * easeOutBack(p); pawlLift = p < 0.82 ? Math.sin((p / 0.82) * Math.PI) * 1 : 0; }
      else if (anim.kind === 'reset') { wheelAngle = anim.from + (anim.to - anim.from) * (1 - (1 - p) ** 3); }
      else { // blocked: the wheel tries to go back a little, the pawl bites, everything springs back
        const k = Math.sin(p * Math.PI * 3) * (1 - p); wheelAngle = anim.from + deg(6) * Math.max(0, Math.sin(Math.min(p * 4, 1) * Math.PI / 2)) * (1 - p) ** 2;
        shake = k * 0.05; pawlLift = -0.35 * (1 - p);
      }
      if (p >= 1) { if (anim.kind === 'reset') wheelAngle = 0; anim = null; }
    }
    wheel.rotation.z = wheelAngle;
    pawlPivot.rotation.z = deg(-2) + pawlLift * deg(7);
    root.position.x = shake;
    rings.forEach((r, i) => { r.rotation.z += dt * (0.15 + i * 0.05) * (i % 2 ? -1 : 1); });
    dots.children.forEach((d) => { d.userData.a += dt * d.userData.s * 0.3; d.position.x = Math.cos(d.userData.a) * d.userData.r; d.position.y = Math.sin(d.userData.a) * d.userData.r; });
    chevron.position.y = Math.sin(now / 700) * 0.02;
    controls.update(); renderer.render(scene, camera);
  }
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.05 }); io.observe(canvas);
  requestAnimationFrame(frame);

  return {
    step, tryBack: () => blocked('back'), reset, get tier() { return tier; },
    dispose() { running = false; ro.disconnect(); io.disconnect(); controls.dispose(); renderer.dispose(); },
  };
}
