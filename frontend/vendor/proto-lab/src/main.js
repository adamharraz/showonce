import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARDS, label } from './catalog/boards.js';
import { PARTS, PART_CATS, LED_COL } from './catalog/parts.js';
import { analyze, defOf, autoWire, wireColor, rotXY, canPlug, mainBoard, POWER, isSignal } from './circuit.js';
import { layout, BB_TOP, holeLabel } from './breadboard.js';
import { buildItem, pinTop, liftOf, drawScreen, setLedColor } from './models.js';
import { generate, langsFor, LANGS, sensorVars, ACTIONS, instanceNames } from './codegen.js';
import { Sim } from './sim.js';
import { EXAMPLES } from './examples.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const P = 2.54;
let toastT;
function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const reportStatus = (state) => window.parent.postMessage({ type: 'showonce:proto-lab-status', state }, '*');

// ── State ──────────────────────────────────────────────────────────────────
const S = { doc: null, A: null, sel: null, mode: 'move', tab: 'inspect', pending: null, hover: null, running: false, sound: false, pinInfo: true, focusSensor: null };
const undoStack = [], redoStack = [];
let uidN = 1;
const newUid = (p) => { let u; do u = `${p.replace(/[^a-z0-9]/gi, '')}_${uidN++}`; while (S.doc.items.some((x) => x.uid === u) || S.doc.wires.some((w) => w.uid === u)); return u; };
function commit() { undoStack.push(JSON.stringify(S.doc)); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; }

// ── Scene ──────────────────────────────────────────────────────────────────
const canvas = $('#scene');
const renderer = (() => {
  try { return new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (error) { reportStatus('webgl'); throw error; }
})();
canvas.addEventListener('webglcontextlost', () => reportStatus('webgl'));
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1210');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.fog = new THREE.Fog('#0d1210', 900, 2200);
const camera = new THREE.PerspectiveCamera(36, 1, 2, 5000);
camera.position.set(0, 330, 300);

// pointer handlers must run before OrbitControls, so register them first
canvas.addEventListener('pointerdown', onDown);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 40; controls.maxDistance = 1600;
controls.screenSpacePanning = false;
scene.add(new THREE.HemisphereLight('#e6f2ff', '#2a2420', 0.7));
const sun = new THREE.DirectionalLight('#fff6ea', 2.2);
sun.position.set(-160, 420, 220); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -360, right: 360, top: 300, bottom: -300, near: 50, far: 1200 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.4;
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fc8ff', 0.5); fill.position.set(250, 200, -200); scene.add(fill);

// bench: self-healing cutting mat
function matTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#1e4a3c'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i <= 1024; i += 1024 / 20) { g.strokeStyle = i % (1024 / 4) === 0 ? 'rgba(220,255,240,.32)' : 'rgba(220,255,240,.13)'; g.lineWidth = i % (1024 / 4) === 0 ? 2 : 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  for (let i = 0; i < 1024; i += 1024 / 100) { g.strokeStyle = 'rgba(220,255,240,.05)'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const bench = new THREE.Mesh(new THREE.PlaneGeometry(1200, 800), new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.92 }));
bench.rotation.x = -Math.PI / 2; bench.receiveShadow = true; scene.add(bench);
const edge = new THREE.Mesh(new THREE.BoxGeometry(1210, 6, 810), new THREE.MeshStandardMaterial({ color: '#173a2f', roughness: 0.9 }));
edge.position.y = -3.1; edge.receiveShadow = true; scene.add(edge);

const itemsG = new THREE.Group(); scene.add(itemsG);
const wiresG = new THREE.Group(); scene.add(wiresG);
const fxG = new THREE.Group(); scene.add(fxG);
const views = new Map();   // uid → { group, H, def, sig, glow }

// hover / net markers
const markGeo = new THREE.SphereGeometry(0.85, 12, 8);
const netMarks = new THREE.InstancedMesh(markGeo, new THREE.MeshBasicMaterial({ color: '#3fd0a0', toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 }), 400);
netMarks.count = 0; netMarks.renderOrder = 10; scene.add(netMarks);
const hoverRing = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.35, 8, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, depthTest: false }));
hoverRing.rotation.x = -Math.PI / 2; hoverRing.visible = false; hoverRing.renderOrder = 11; scene.add(hoverRing);
const rubber = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: '#3fd0a0', dashSize: 3, gapSize: 2, depthTest: false }));
rubber.visible = false; rubber.renderOrder = 12; scene.add(rubber);
const selBox = new THREE.Box3Helper(new THREE.Box3(), '#3fd0a0'); selBox.visible = false; scene.add(selBox);
const errBoxes = new THREE.Group(); scene.add(errBoxes);

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
}

// ── Items ──────────────────────────────────────────────────────────────────
function sigOf(it) { return `${it.type}|${JSON.stringify(it.props || {})}`; }
function syncViews() {
  const seen = new Set();
  for (const it of S.doc.items) {
    seen.add(it.uid);
    const def = defOf(it); if (!def) continue;
    let v = views.get(it.uid);
    if (!v || v.sig !== sigOf(it)) {
      if (v) { itemsG.remove(v.group); dispose(v.group); }
      const { group, H } = buildItem(def, it.props || {});
      group.userData.uid = it.uid;
      group.traverse((o) => { o.userData.uid = it.uid; });
      v = { group, H, def, sig: sigOf(it) };
      if (H.lamp) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: H.lampColor || '#ff3030', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.set(13, 13, 1); sp.position.set(0, 6, 0); sp.raycast = () => {}; group.add(sp); v.glow = sp; }
      views.set(it.uid, v); itemsG.add(group);
    }
    placeView(it, v);
  }
  for (const [uid, v] of views) if (!seen.has(uid)) { itemsG.remove(v.group); dispose(v.group); views.delete(uid); }
}
function placeView(it, v) {
  v.group.position.set(it.x, liftOf(v.def, S.A?.onBB.has(it.uid)), it.y);
  v.group.rotation.y = -(it.rot || 0) * Math.PI / 2;
  v.group.updateMatrixWorld(true);
}
function dispose(o) { o.traverse((m) => { if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose(); }); }

const pinPos = new Map();   // key → world Vector3
function computePinPositions() {
  pinPos.clear();
  for (const pin of S.A.pins.values()) {
    const v = views.get(pin.uid); if (!v) continue;
    const local = new THREE.Vector3(pin.p.x, pin.kind === 'hole' ? BB_TOP + 0.1 : pinTop(pin.def), pin.p.y);
    pinPos.set(pin.key, v.group.localToWorld(local));
  }
}

// ── Wires ──────────────────────────────────────────────────────────────────
const wireMats = new Map();
const wireMat = (c) => { if (!wireMats.has(c)) wireMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05 })); return wireMats.get(c); };
const plugGeo = new THREE.BoxGeometry(2.4, 6, 2.4); plugGeo.translate(0, 3, 0);
const plugMat = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.6 });
function buildWires() {
  for (const m of wiresG.children) if (m.geometry !== plugGeo) m.geometry.dispose();
  wiresG.clear();
  for (const w of S.doc.wires) {
    const a = pinPos.get(w.a), b = pinPos.get(w.b); if (!a || !b) continue;
    const d = a.distanceTo(b);
    const pa = S.A.pins.get(w.a), pb = S.A.pins.get(w.b);
    const low = pa?.kind === 'hole' && pb?.kind === 'hole' && d < 45;
    let pts;
    const up = (p, h) => p.clone().add(new THREE.Vector3(0, h, 0));
    if (low) { const h = 2.2 + d * 0.04; pts = [a, up(a, h), up(a.clone().lerp(b, 0.5), h + 0.4), up(b, h), b]; }
    else { const h = Math.min(70, 9 + d * 0.28); const m = a.clone().lerp(b, 0.5); pts = [a, up(a, h * 0.55), up(m, h), up(b, h * 0.55), b]; }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const sel = S.sel === `w:${w.uid}`;
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(d / 2)), sel ? 0.85 : 0.6, 8, false), sel ? new THREE.MeshStandardMaterial({ color: w.color, emissive: '#3fd0a0', emissiveIntensity: 0.6 }) : wireMat(w.color));
    mesh.castShadow = true; mesh.userData.wire = w.uid; wiresG.add(mesh);
    if (!low) for (const [p, k] of [[a, pa], [b, pb]]) {
      if (k?.kind === 'hole') continue;
      const plug = new THREE.Mesh(plugGeo, plugMat); plug.position.copy(p); plug.userData.wire = w.uid; plug.castShadow = true; wiresG.add(plug);
    }
  }
}

// ── Refresh pipeline ───────────────────────────────────────────────────────
let lightPending = false;
function refresh(full = true) {
  S.A = analyze(S.doc);
  syncViews();
  for (const it of S.doc.items) { const v = views.get(it.uid); if (v) placeView(it, v); }
  computePinPositions();
  buildWires();
  updateSelectionBox();
  if (full) { updateErrorBoxes(); renderPanel(); updateStatus(); updateHint(); updateUndo(); }
}
function refreshLight() { if (lightPending) return; lightPending = true; requestAnimationFrame(() => { lightPending = false; refresh(false); }); }
function updateSelectionBox() {
  const v = S.sel && !S.sel.startsWith('w:') && views.get(S.sel);
  selBox.visible = !!v;
  if (v) { selBox.box.setFromObject(v.group); selBox.box.expandByScalar(1.5); }
}
function updateErrorBoxes() {
  for (const c of errBoxes.children) c.geometry.dispose();
  errBoxes.clear();
  const bad = new Set(S.A.issues.filter((i) => i.sev === 'error' && i.uid).map((i) => i.uid));
  for (const uid of bad) { const v = views.get(uid); if (!v || uid === S.sel) continue; const b = new THREE.Box3().setFromObject(v.group).expandByScalar(1); errBoxes.add(new THREE.Box3Helper(b, '#ff5b5b')); }
}
function updateStatus() {
  const A = S.A, e = A.issues.filter((i) => i.sev === 'error').length, w = A.issues.filter((i) => i.sev === 'warn').length;
  const main = mainBoard(A);
  const parts = S.doc.items.filter((i) => defOf(i)?.kind === 'part').length;
  $('#status').innerHTML = `${main ? `<b>${esc(BOARDS[main.type].name)}</b> · ` : ''}${parts} part${parts === 1 ? '' : 's'} · ${S.doc.wires.length} wire${S.doc.wires.length === 1 ? '' : 's'} · ${e ? `<span class="e">${e} error${e > 1 ? 's' : ''}</span>` : '<span>no errors</span>'}${w ? ` · <span class="w">${w} warning${w > 1 ? 's' : ''}</span>` : ''}`;
  const badge = $('#badge'); badge.textContent = e || w || '✓'; badge.className = e ? 'bad' : w ? 'warn' : 'good';
}
function updateHint() {
  let h = '';
  if (S.mode === 'wire') h = S.pending ? `Wiring from <b>${esc(pinName(S.pending))}</b> — click another pin or hole · <kbd>Esc</kbd> cancels` : 'Wire tool: click a pin or breadboard hole, then another · <kbd>V</kbd> back to Move';
  else if (S.running) h = 'Simulation running — change sensor values in the Simulate tab, or click buttons on the bench';
  else if (!S.doc.items.length) h = 'Pick a board from the library, or load an example';
  else h = 'Drag parts · <kbd>R</kbd> rotate · <kbd>W</kbd> wire tool · <kbd>Del</kbd> delete';
  $('#hint').innerHTML = h;
}
function updateUndo() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

// ── Names & pin descriptions ───────────────────────────────────────────────
function itemName(it) { return it.name || defOf(it)?.name || it.type; }
function pinName(key) {
  const p = S.A.pins.get(key); if (!p) return key;
  if (p.kind === 'hole') return `${holeLabel(p.n)}`;
  return `${itemName(p.it)} · ${label(p.n)}`;
}
const CAPN = { pwm: 'PWM', adc: 'ADC', sda: 'I²C SDA', scl: 'I²C SCL', mosi: 'SPI MOSI', miso: 'SPI MISO', sck: 'SPI SCK', cs: 'SPI CS', tx: 'UART TX', rx: 'UART RX', int: 'interrupt', dac: 'DAC', inputOnly: 'input only', strap: 'boot strap', adc2: 'ADC2', reserved: 'reserved', adcOnly: 'analog only' };
const capClass = (c) => (c === 'pwm' ? 'pwm' : c.startsWith('adc') || c === 'dac' ? 'adc' : ['sda', 'scl'].includes(c) ? 'i2c' : ['mosi', 'miso', 'sck', 'cs'].includes(c) ? 'spi' : ['tx', 'rx'].includes(c) ? 'uart' : ['inputOnly', 'strap', 'reserved'].includes(c) ? 'bad' : '');
const TYPE_N = { vcc: 'power in', gnd: 'ground', src: 'supply out', do: 'digital out', di: 'digital in', dio: 'data (bi-dir)', ao: 'analog out', pwm: 'PWM in', servo: 'servo signal', tone: 'tone in', sda: 'I²C SDA', scl: 'I²C SCL', mosi: 'SPI MOSI', miso: 'SPI MISO', sck: 'SPI SCK', cs: 'SPI CS', tx: 'UART TX', rx: 'UART RX', a: 'anode (+)', k: 'cathode (−)', p: 'terminal', nc: 'not used', sw: 'switch', motor: 'motor', ain: 'analog in', ls: 'low side', hs: 'high side', lvref: 'LV supply', hvref: 'HV supply' };
const ROLE_N = { gnd: 'ground', p5: '5 V out', p33: '3.3 V out', vin: 'power in', gpio: 'GPIO', flash: 'flash (do not use)', other: '' };
function pinDesc(pin) {
  if (pin.kind === 'board') { const r = pin.p.role; return [ROLE_N[r] || '', ...(pin.p.caps || []).map((c) => CAPN[c] || c)].filter(Boolean).join(' · '); }
  if (pin.kind === 'hole') return 'breadboard hole';
  return TYPE_N[pin.p.t] || pin.p.t;
}
function netSummary(key, max = 4) {
  const n = S.A.net(key); if (!n) return '';
  const others = n.keys.filter((k) => k !== key).map((k) => S.A.pins.get(k)).filter((p) => p.kind !== 'hole');
  if (!others.length) return n.keys.length > 1 ? 'on a breadboard strip, nothing else connected' : 'not connected';
  const names = others.slice(0, max).map((p) => `${itemName(p.it)} ${label(p.n)}`);
  return `→ ${names.join(', ')}${others.length > max ? ` +${others.length - max}` : ''}`;
}

// ── Pointer interaction ────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null, pressSensor = null;
const mouse = { x: 0, y: 0, inside: false };
function setNdc(e) { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; ndc.set((mouse.x / r.width) * 2 - 1, -(mouse.y / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundAt(h = 0) { const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p) ? p : null; }
function pickItem() { const hits = ray.intersectObjects(itemsG.children, true); return hits.length ? hits[0].object.userData.uid : null; }
function pickWire() { const hits = ray.intersectObjects(wiresG.children, false); return hits.length ? hits[0].object.userData.wire : null; }
const tmpV = new THREE.Vector3();
function pickPin(maxPx = 11) {
  const r = canvas.getBoundingClientRect();
  let best = null, bd = maxPx * maxPx;
  for (const [k, p] of pinPos) {
    if (S.A.occupied.has(k)) continue;
    tmpV.copy(p).project(camera); if (tmpV.z > 1) continue;
    const x = (tmpV.x + 1) / 2 * r.width, y = (1 - tmpV.y) / 2 * r.height;
    const d = (x - mouse.x) ** 2 + (y - mouse.y) ** 2 - (S.A.pins.get(k).kind === 'hole' ? 0 : 6);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function onDown(e) {
  if (e.button !== 0) return;
  setNdc(e);
  if (S.running) {
    const uid = pickItem(); const it = uid && S.doc.items.find((x) => x.uid === uid);
    if (it && ['button', 'touch', 'pir', 'irobstacle', 'tilt', 'hall'].includes(it.type)) { const v = defOf(it).vals[0]; sim.set(uid, v.k, 1); pressSensor = { uid, k: v.k }; controls.enabled = false; e.stopImmediatePropagation(); return; }
    if (it && defOf(it).vals) { S.focusSensor = uid; setTab('sim'); }
  }
  if (S.mode === 'wire') {
    const k = pickPin(14);
    if (k) {
      e.stopImmediatePropagation(); controls.enabled = false;
      if (!S.pending) { S.pending = k; rubber.visible = true; }
      else if (k !== S.pending) addWire(S.pending, k);
      else { S.pending = null; rubber.visible = false; }
      updateHint(); return;
    }
    const w = pickWire(); if (w) { select(`w:${w}`); return; }
    if (S.pending) { S.pending = null; rubber.visible = false; updateHint(); }
    return;
  }
  const w = pickWire(); const uid = pickItem();
  if (w && !uid) { select(`w:${w}`); return; }
  if (!uid) { if (S.sel) select(null); return; }
  if (S.running && !e.shiftKey) { select(uid); return; }
  const it = S.doc.items.find((x) => x.uid === uid);
  select(uid);
  const g = groundAt(0);
  if (!g) return;
  e.stopImmediatePropagation(); controls.enabled = false;
  drag = { uid, it, ox: it.x - g.x, oy: it.y - g.z, startX: it.x, startY: it.y, moved: false, snapshot: JSON.stringify(S.doc) };
  canvas.setPointerCapture(e.pointerId);
}
canvas.addEventListener('pointermove', (e) => {
  setNdc(e); mouse.inside = true;
  if (drag) {
    const g = groundAt(0); if (!g) return;
    let x = g.x + drag.ox, y = g.z + drag.oy;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) < 1.5) return;
    drag.moved = true;
    [x, y] = snapPosition(drag.it, x, y);
    drag.it.x = x; drag.it.y = y;
    refreshLight();
    hideTip();
    return;
  }
  hoverUpdate();
});
canvas.addEventListener('pointerup', (e) => {
  if (pressSensor) { sim.set(pressSensor.uid, pressSensor.k, 0); pressSensor = null; controls.enabled = true; return; }
  controls.enabled = true;
  if (drag) {
    if (drag.moved) { undoStack.push(drag.snapshot); redoStack.length = 0; refresh(); }
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  }
});
canvas.addEventListener('pointerleave', () => { mouse.inside = false; hideTip(); netMarks.count = 0; hoverRing.visible = false; });
canvas.addEventListener('dblclick', (e) => { setNdc(e); const uid = pickItem(); if (uid) { select(uid); focusOn(uid); } });

function hoverUpdate() {
  const wantPins = S.mode === 'wire' || S.pinInfo;
  const k = wantPins ? pickPin(S.mode === 'wire' ? 14 : 9) : null;
  S.hover = k;
  if (S.pending) {
    const a = pinPos.get(S.pending), b = k ? pinPos.get(k) : groundAt(BB_TOP);
    if (a && b) { rubber.geometry.setFromPoints([a, b]); rubber.computeLineDistances(); }
  }
  if (!k) { hideTip(); netMarks.count = 0; hoverRing.visible = false; canvas.style.cursor = S.mode === 'wire' ? 'crosshair' : (pickItem() ? 'grab' : 'default'); return; }
  canvas.style.cursor = S.mode === 'wire' ? 'crosshair' : 'help';
  const pin = S.A.pins.get(k), pos = pinPos.get(k);
  hoverRing.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0)); hoverRing.visible = true;
  // highlight net
  const n = S.A.net(k); const d = new THREE.Object3D(); let c = 0;
  for (const kk of n.keys) { if (kk === k || c >= 400) continue; const p = pinPos.get(kk); if (!p) continue; d.position.copy(p); d.updateMatrix(); netMarks.setMatrixAt(c++, d.matrix); }
  netMarks.count = c; netMarks.instanceMatrix.needsUpdate = true;
  const tip = $('#tip');
  const title = pin.kind === 'hole' ? holeLabel(pin.n) : `${label(pin.n)}`;
  const sub = pin.kind === 'hole' ? itemName(pin.it) : itemName(pin.it);
  tip.innerHTML = `<b>${esc(title)}</b> <span class="muted">${esc(sub)}</span><small>${esc(pinDesc(pin))}</small><small>${esc(netSummary(k))}</small>`;
  tip.style.left = `${mouse.x}px`; tip.style.top = `${mouse.y}px`; tip.hidden = false;
}
function hideTip() { $('#tip').hidden = true; }

/** Snap a dragged item: plug pins into breadboard holes when close, otherwise a 1.27 mm grid. */
function snapPosition(it, x, y) {
  const def = defOf(it);
  if (canPlug(def) && def.pins.length) {
    const p0 = def.pins[0];
    const [ox, oy] = rotXY({ x: 0, y: 0, rot: it.rot }, p0.x, p0.y);
    let best = null;
    for (const bb of S.doc.items) {
      const bd = defOf(bb); if (!bd?.breadboard) continue;
      const wx = x + ox - bb.x, wy = y + oy - bb.y;
      const th = -(bb.rot || 0) * Math.PI / 2, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
      const lx = wx * c - wy * s, ly = wx * s + wy * c;
      if (Math.abs(lx) > bd.w / 2 + 4 || Math.abs(ly) > bd.h / 2 + 4) continue;
      for (const h of layout(bd.breadboard).holes) {
        const d = (h.x - lx) ** 2 + (h.y - ly) ** 2;
        if (d < 3.2 * 3.2 && (!best || d < best.d)) { const [hx, hy] = rotXY(bb, h.x, h.y); best = { d, x: hx - ox, y: hy - oy }; }
      }
    }
    if (best) return [best.x, best.y];
  }
  const g = def.breadboard ? P : 1.27;
  return [Math.round(x / g) * g, Math.round(y / g) * g];
}

// ── Editing ────────────────────────────────────────────────────────────────
function select(sel) { S.sel = sel; S.focusSensor = null; if (sel && S.tab !== 'sim') setTab('inspect', false); refresh(); }
function addItem(type) {
  const def = BOARDS[type] || PARTS[type]; if (!def) return;
  commit();
  const t = controls.target;
  let x = Math.round(t.x / P) * P, y = Math.round(t.z / P) * P;
  // find a free spot near the view centre
  const boxes = S.doc.items.map((it) => { const [fw, fh] = footprint(defOf(it)); const r = (it.rot || 0) % 2; const w = (r ? fh : fw) + 4, h = (r ? fw : fh) + 4; return [it.x - w, it.y - h, it.x + w, it.y + h]; });
  const [hw, hh] = footprint(def);
  const fits = (cx, cy) => boxes.every(([a, b, c, d]) => cx + hw < a || cx - hw > c || cy + hh < b || cy - hh > d);
  outer: for (let r = 0; r < 30; r++) for (let k = 0; k < Math.max(1, r * 8); k++) { const a = (k / Math.max(1, r * 8)) * Math.PI * 2; const cx = x + Math.cos(a) * r * 18, cy = y + Math.sin(a) * r * 14; if (fits(cx, cy)) { x = Math.round(cx / P) * P; y = Math.round(cy / P) * P; break outer; } }
  const props = {};
  for (const [k, p] of Object.entries(def.props || {})) props[k] = p.def ?? p.opts[0];
  const it = { uid: newUid(type), type, x, y, rot: 0, props };
  S.doc.items.push(it);
  if (def.kind === 'board' && !mainBoard(analyze(S.doc))?.uid) S.doc.main = it.uid;
  if (def.kind === 'board' && !S.doc.main) S.doc.main = it.uid;
  S.sel = it.uid; refresh();
  if (S.doc.items.length <= 2) fitAll();
  toast(def.kind === 'board' ? `${def.name} added — add sensors, then wire them (or use Auto-wire)` : canPlug(def) && S.doc.items.some((i) => defOf(i).breadboard) ? `${def.name} added — drag it onto the breadboard to plug it in` : `${def.name} added`);
}
function footprint(def) {
  let hw = def.w / 2, hh = def.h / 2;
  for (const f of def.feats || []) { const fw = (f.w ?? (f.axis === 'x' ? f.len || f.h : (f.r || 2) * 2)) / 2, fd = (f.d ?? (f.axis === 'y' ? f.len || f.h : (f.r || 2) * 2)) / 2; hw = Math.max(hw, Math.abs(f.x) + fw); hh = Math.max(hh, Math.abs(f.y) + fd); }
  return [hw, hh];
}
function addWire(a, b) {
  if (a === b) return;
  if (S.doc.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) { toast('Those pins are already wired'); S.pending = null; rubber.visible = false; return; }
  commit();
  const pa = S.A.pins.get(a), pb = S.A.pins.get(b);
  const t = pa.kind === 'part' ? pa.p.t : pb.kind === 'part' ? pb.p.t : undefined;
  S.doc.wires.push({ uid: newUid('w'), a, b, color: wireColor(S.A, a, b, t) });
  S.pending = null; rubber.visible = false;
  refresh();
  const n = S.A.net(a); toast(`Wired ${pinName(a)} ↔ ${pinName(b)}${n.multiV || (n.src.length && n.gndRef) ? ' — check the Check tab!' : ''}`);
}
function removeSel() {
  if (!S.sel) return;
  commit();
  if (S.sel.startsWith('w:')) { const id = S.sel.slice(2); S.doc.wires = S.doc.wires.filter((w) => w.uid !== id); }
  else {
    const uid = S.sel;
    S.doc.items = S.doc.items.filter((i) => i.uid !== uid);
    S.doc.wires = S.doc.wires.filter((w) => !w.a.startsWith(`${uid}:`) && !w.b.startsWith(`${uid}:`));
    S.doc.rules = (S.doc.rules || []).filter((r) => r.dst !== uid && !r.src.startsWith(`${uid}.`));
    if (S.doc.main === uid) S.doc.main = S.doc.items.find((i) => BOARDS[i.type])?.uid || null;
  }
  S.sel = null; refresh();
}
function rotateSel() {
  const it = S.sel && S.doc.items.find((i) => i.uid === S.sel); if (!it) return;
  commit(); it.rot = ((it.rot || 0) + 1) % 4;
  [it.x, it.y] = snapPosition(it, it.x, it.y);
  refresh();
}
function autoWireSel() {
  const it = S.doc.items.find((i) => i.uid === S.sel); const main = mainBoard(S.A);
  if (!it || !main) { toast('Add a board first'); return; }
  const r = autoWire(S.A, it.uid, main.uid);
  if (!r.wires.length) { toast(r.notes[0] || 'Nothing to wire — it is already connected'); return; }
  commit();
  for (const w of r.wires) S.doc.wires.push({ uid: newUid('w'), a: w.a, b: w.b, color: wireColor(S.A, w.a, w.b, w.t) });
  refresh();
  toast(`${r.wires.length} wire${r.wires.length > 1 ? 's' : ''} added${r.notes.length ? ` · ${r.notes[0]}` : ''}`, 3200);
}
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(S.doc)); S.doc = JSON.parse(undoStack.pop()); S.sel = null; refresh(); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(S.doc)); S.doc = JSON.parse(redoStack.pop()); S.sel = null; refresh(); }
function loadDoc(doc, msg) {
  S.doc = { v: 1, items: [], wires: [], rules: [], main: null, lang: null, ...doc };
  for (const x of [...S.doc.items, ...S.doc.wires, ...(S.doc.rules || [])]) { const m = String(x.uid).match(/_(\d+)$/); if (m) uidN = Math.max(uidN, +m[1] + 1); }
  S.sel = null; S.pending = null; undoStack.length = 0; redoStack.length = 0;
  if (S.running) toggleRun();
  refresh(); fitAll(true);
  if (msg) toast(msg);
}

// ── Camera ─────────────────────────────────────────────────────────────────
let camAnim = null;
function flyTo(target, pos, instant) {
  if (instant) { controls.target.copy(target); camera.position.copy(pos); controls.update(); return; }
  camAnim = { t: 0, ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos };
}
function fitAll(instant) {
  const box = new THREE.Box3();
  for (const v of views.values()) box.expandByObject(v.group);
  if (box.isEmpty()) box.set(new THREE.Vector3(-120, 0, -80), new THREE.Vector3(120, 20, 80));
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * camera.aspect;
  const top = S.view === 'top';
  const r = Math.max((s.x * 0.56) / th, (s.z * (top ? 0.58 : 0.66)) / tv + s.y, 110);
  c.y = 0; if (!top) c.z += s.z * 0.06;
  const dir = S.view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0, 1.05, 0.95).normalize();
  flyTo(c, c.clone().add(dir.multiplyScalar(r)), instant);
}
function focusOn(uid) {
  const v = views.get(uid); if (!v) return;
  const box = new THREE.Box3().setFromObject(v.group); const c = box.getCenter(new THREE.Vector3()); const r = Math.max(box.getSize(new THREE.Vector3()).length() * 1.6, 90);
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(c, c.clone().add(dir.multiplyScalar(r)));
}

// ── Library ────────────────────────────────────────────────────────────────
const CAT_ICON = { Boards: '▦', 'Breadboards & power': '▤', Environment: '🌡', 'Light & colour': '☀', 'Motion & position': '🧭', Distance: '📏', 'Sound, touch & more': '🔊', Inputs: '🎛', Outputs: '💡', 'Motors & actuators': '⚙', Communication: '📡', Passives: 'Ω' };
function renderLibrary() {
  const q = $('#q').value.trim().toLowerCase();
  const groups = [['Boards', Object.values(BOARDS)], ...PART_CATS.map((c) => [c, Object.values(PARTS).filter((p) => p.cat === c)])];
  let html = '', total = 0;
  for (const [cat, list] of groups) {
    const items = list.filter((d) => !q || `${d.name} ${d.desc} ${d.cat} ${d.id}`.toLowerCase().includes(q));
    if (!items.length) continue;
    total += items.length;
    html += `<h3>${esc(cat)} <small>${items.length}</small></h3><div class="lib">`;
    for (const d of items) {
      const color = d.pcb || (d.id === 'led' ? '#ff2b2b' : d.breadboard ? '#e9e8e2' : '#555');
      const tag = d.kind === 'board' ? `${d.logic}V` : d.i2c ? `0x${d.i2c.toString(16).toUpperCase()}` : d.vmax ? (d.vmax <= 3.6 ? '3.3V' : d.vmin >= 4.5 ? '5V' : '3.3/5V') : '';
      html += `<button class="pcard" data-add="${d.id}" title="${esc(d.desc)}"><span class="sw" style="background:${color}">${CAT_ICON[cat] || '•'}</span><span class="pt"><b>${esc(d.name)}</b><small>${esc(d.desc)}</small></span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
    }
    html += '</div>';
  }
  $('#lib').innerHTML = html || '<p class="note">No parts match.</p>';
  $('#q').placeholder = `Search ${Object.keys(BOARDS).length + Object.keys(PARTS).length} boards, sensors, modules…`;
}
$('#lib').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) addItem(b.dataset.add); });
$('#q').addEventListener('input', renderLibrary);

// ── Right panel ────────────────────────────────────────────────────────────
function setTab(t, render = true) { S.tab = t; document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t)); if (render) renderPanel(); }
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function renderPanel() {
  const el = $('#panel');
  const st = el.scrollTop;
  if (S.tab === 'inspect') el.innerHTML = inspectHtml();
  else if (S.tab === 'check') el.innerHTML = checkHtml();
  else if (S.tab === 'code') el.innerHTML = codeHtml();
  else el.innerHTML = simHtml();
  el.scrollTop = st;
  if (S.tab === 'sim' && S.focusSensor) el.querySelector(`[data-ctrl="${S.focusSensor}"]`)?.scrollIntoView({ block: 'nearest' });
}

function capsHtml(caps) { return (caps || []).map((c) => `<span class="chip ${capClass(c)}">${esc(CAPN[c] || c)}</span>`).join(''); }
function inspectHtml() {
  if (!S.sel) return overviewHtml();
  if (S.sel.startsWith('w:')) {
    const w = S.doc.wires.find((x) => `w:${x.uid}` === S.sel); if (!w) return overviewHtml();
    const cols = ['#e0262b', '#222226', '#ffd23f', '#2fbf4a', '#2a8bff', '#ff8a1f', '#a77bff', '#ffffff', '#8a5a2b'];
    return `<div class="kind">Jumper wire</div><h2>${esc(pinName(w.a))}</h2><p class="desc">to <b>${esc(pinName(w.b))}</b></p>
      <h3>Colour</h3><div class="swatches">${cols.map((c) => `<button data-wcol="${c}" class="${c === w.color ? 'on' : ''}" style="background:${c}" title="${c}"></button>`).join('')}</div>
      <p class="note">Convention: red for power, black for ground, colours for signals.</p>
      <div class="btnrow"><button class="btn danger" data-act="delete">Delete wire</button></div>`;
  }
  const it = S.doc.items.find((i) => i.uid === S.sel); if (!it) return overviewHtml();
  const def = defOf(it), A = S.A, C = A.conn.get(it.uid);
  const issues = A.issues.filter((i) => i.uid === it.uid);
  let h = `<div class="kind">${esc(def.kind === 'board' ? 'Board' : def.cat)}</div><h2>${esc(def.name)}</h2><p class="desc">${esc(def.desc)}</p>`;
  const specs = [];
  if (def.kind === 'board') { specs.push(['Logic level', `${def.logic} V`], ['GPIO', def.pins.filter((p) => p.role === 'gpio').length], ['PWM pins', def.pins.filter((p) => p.caps?.includes('pwm')).length], ['Analog in', def.noAdc ? 'none' : def.pins.filter((p) => p.caps?.includes('adc')).length]); const pw = POWER[def.id]; if (pw) specs.push(['5 V budget', `${pw.p5} mA`], ['3.3 V budget', `${pw.p33} mA`]); }
  else {
    if (def.vmin !== undefined) specs.push(['Supply', `${def.vmin}–${def.vmax} V`]);
    if (def.ma) specs.push(['Current', `${def.ma >= 1 ? Math.round(def.ma) : def.ma} mA`]);
    if (def.i2c) specs.push(['I²C address', `0x${def.i2c.toString(16).toUpperCase()}`]);
    if (C?.v) specs.push(['Powered at', `${C.v} V`]);
    if (C?.mA) specs.push(['LED current', `${C.mA.toFixed(1)} mA`]);
    if (def.battery) specs.push(['Voltage', `${def.battery} V`]);
  }
  if (specs.length) h += `<dl class="specs">${specs.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
  // props
  if (def.props) {
    h += '<div class="form">';
    for (const [k, p] of Object.entries(def.props)) {
      const cur = (it.props || {})[k] ?? p.def ?? p.opts[0];
      if (k === 'cap') h += `<label>${esc(p.l)}<div class="swatches">${p.opts.map((c) => `<button data-prop="${k}" data-val="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></label>`;
      else h += `<label>${esc(p.l)}<select data-prop="${k}">${p.opts.map((o) => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}${p.unit ? ` ${p.unit}` : k === 'ohms' ? ' Ω' : ''}</option>`).join('')}</select></label>`;
    }
    h += '</div>';
  }
  h += '<div class="btnrow">';
  if (def.kind === 'part' && !def.breadboard && !def.passive && !def.psu && !def.battery && def.id !== 'led' && def.id !== 'rgbled' && def.id !== 'motor') h += `<button class="btn primary" data-act="autowire" title="Pick suitable pins on the main board and add jumper wires">⚡ Auto-wire to ${esc(mainBoard(A) ? BOARDS[mainBoard(A).type].name : 'board')}</button>`;
  if (def.kind === 'board' && mainBoard(A)?.uid !== it.uid) h += '<button class="btn primary" data-act="main">Make main board</button>';
  h += '<button class="btn" data-act="rotate">⟳ Rotate</button><button class="btn" data-act="focus">Focus</button><button class="btn danger" data-act="delete">Delete</button></div>';
  if (issues.length) h += `<ul class="issues">${issues.map(issueLi).join('')}</ul>`;
  // pins
  if (!def.breadboard) {
    h += `<h3>Pins <small>${def.pins.length}</small></h3><table class="pins">`;
    for (const p of def.pins) {
      const key = `${it.uid}:${p.n}`, pin = A.pins.get(key);
      const conn = netSummary(key, 3);
      const what = def.kind === 'board' ? `${p.role !== 'gpio' ? `<span class="chip ${p.role === 'gnd' ? 'gnd' : ['p5', 'p33', 'vin'].includes(p.role) ? 'pwr' : ''}">${esc(ROLE_N[p.role] || p.role)}</span>` : ''}${capsHtml(p.caps)}` : `<span class="chip ${p.t === 'vcc' || p.t === 'src' ? 'pwr' : p.t === 'gnd' ? 'gnd' : ['sda', 'scl'].includes(p.t) ? 'i2c' : ['mosi', 'miso', 'sck', 'cs'].includes(p.t) ? 'spi' : p.t === 'ao' ? 'adc' : ['pwm', 'servo', 'tone'].includes(p.t) ? 'pwm' : ['tx', 'rx'].includes(p.t) ? 'uart' : ''}">${esc(TYPE_N[p.t] || p.t)}</span>`;
      const plugged = A.plugged.get(key);
      h += `<tr><td>${esc(label(p.n))}${def.kind === 'board' && p.phys ? ` <span class="muted">#${p.phys}</span>` : ''}</td><td>${what}<div class="to ${conn === 'not connected' ? 'muted' : ''}">${plugged ? `<span class="muted">in ${esc(plugged.split(':')[1])} </span>` : ''}${esc(conn)}</div></td></tr>`;
      void pin;
    }
    h += '</table>';
  } else {
    const L = layout(def.breadboard);
    h += `<p class="note">${L.cols} columns × 10 rows plus 4 power rails. Holes a–e in one column are connected, as are f–j; each rail runs the full length. Plugged-in parts connect automatically.</p>`;
  }
  return h;
}
function overviewHtml() {
  const A = S.A, main = mainBoard(A);
  const boards = S.doc.items.filter((i) => BOARDS[i.type]);
  let h = `<div class="kind">Project</div><h2>${esc(S.doc.title || 'Untitled prototype')}</h2>`;
  if (!S.doc.items.length) return h + `<p class="desc">Start with a board from the library on the left — Arduino Uno, Nano or Mega, ESP32, ESP8266, Raspberry Pi Pico, Pi 5 or Pi Zero 2 W — then add a breadboard, sensors and outputs.</p><p class="desc">Or load an example from the <b>Examples</b> menu.</p><h3>How it works</h3><ol class="desc"><li>Place parts. Drop them onto a breadboard to plug them in.</li><li>Wire pins with the <b>Wire</b> tool, or select a module and press <b>Auto-wire</b>.</li><li>Fix anything the <b>Check</b> tab flags.</li><li>Add rules and press <b>Simulate</b>.</li><li>Copy the generated firmware from <b>Code</b>.</li></ol>`;
  if (boards.length > 1) h += `<div class="form"><label>Main board (code + simulation)<select data-main>${boards.map((b) => `<option value="${b.uid}" ${b.uid === main?.uid ? 'selected' : ''}>${esc(BOARDS[b.type].name)}</option>`).join('')}</select></label></div>`;
  else if (main) h += `<p class="desc">Main board: <b>${esc(BOARDS[main.type].name)}</b> (${BOARDS[main.type].logic} V logic).</p>`;
  const parts = S.doc.items.filter((i) => defOf(i).kind === 'part' && !defOf(i).breadboard);
  const ok = parts.filter((i) => A.conn.get(i.uid)?.ok).length;
  h += `<dl class="specs"><div><dt>Parts</dt><dd>${parts.length}</dd></div><div><dt>Working</dt><dd>${ok} / ${parts.length}</dd></div><div><dt>Wires</dt><dd>${S.doc.wires.length}</dd></div><div><dt>Nets</dt><dd>${[...A.info.values()].filter((n) => n.connected > 1).length}</dd></div></dl>`;
  h += loadsHtml();
  h += '<p class="note">Select a part to see its pins and connections. Hover any pin for its function; the pins it connects to light up.</p>';
  return h;
}
function loadsHtml() {
  if (!S.A.loads?.length) return '';
  return `<h3>Power budget</h3>${S.A.loads.map((l) => { const f = l.ma / l.max; return `<div class="load"><span>${esc(l.what)}</span><span class="mono">${Math.round(l.ma)} / ${l.max} mA</span></div><div class="bar"><i class="${f > 1 ? 'bad' : f > 0.75 ? 'warn' : ''}" style="width:${Math.min(100, f * 100).toFixed(0)}%"></i></div>`; }).join('')}`;
}
function issueLi(i) { return `<li class="${i.sev}" data-focus="${i.uid || ''}">${esc(i.msg)}${i.fix ? `<em>Fix: ${esc(i.fix)}</em>` : ''}</li>`; }
function checkHtml() {
  const I = S.A.issues;
  const e = I.filter((i) => i.sev === 'error'), w = I.filter((i) => i.sev === 'warn'), n = I.filter((i) => i.sev === 'info');
  let h = '<div class="kind">Electrical rules check</div><h2>Circuit check</h2>';
  h += `<div class="counts"><span class="e"><b>${e.length}</b>errors</span><span class="w"><b>${w.length}</b>warnings</span><span class="i"><b>${n.length}</b>notes</span></div>`;
  if (!e.length && !w.length) h += '<div class="okbox">No electrical problems found. Supplies, logic levels, pin functions, I²C addresses and current budgets all check out.</div>';
  if (I.length) h += `<ul class="issues">${[...e, ...w, ...n].map(issueLi).join('')}</ul>`;
  h += loadsHtml();
  h += `<h3>What is checked</h3><p class="note">Shorts and mixed supplies · module supply range (3.3 V vs 5 V) · 5 V signals into 3.3 V pins · analog pins for analog sensors · I²C, SPI and UART pin functions (TX↔RX) · ESP32 input-only, strapping, flash and ADC2 pins · LED series resistors and current · I²C address clashes · supply current budgets · common ground · motors on GPIO pins.</p>`;
  return h;
}
function highlight(code, lang) {
  const kw = lang === 'arduino' ? /\b(void|int|float|bool|long|unsigned|const|byte|if|else|for|while|return|true|false|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|String)\b/g : /\b(import|from|as|def|while|True|False|None|if|else|elif|for|in|try|except|global|with|return|not|and|or|pass)\b/g;
  return code.split('\n').map((line) => {
    const ci = lang === 'arduino' ? line.indexOf('//') : line.search(/(^|\s)#/);
    const body = ci >= 0 ? line.slice(0, ci) : line, cm = ci >= 0 ? line.slice(ci) : '';
    let b = esc(body).replace(/(&quot;.*?&quot;|'[^']*')/g, '\u0001$1\u0002');
    b = b.replace(/\b(\d+(\.\d+)?|0x[0-9A-Fa-f]+)\b/g, '<span class="n">$1</span>').replace(kw, '<span class="k">$1</span>').replace(/^(\s*)(#include|#define)/, '$1<span class="p">$2</span>');
    b = b.replace(/\u0001(.*?)\u0002/g, (m, s) => `<span class="s">${s.replace(/<[^>]+>/g, '')}</span>`);
    return b + (cm ? `<span class="c">${esc(cm)}</span>` : '');
  }).join('\n');
}
let lastCode = null;
function codeHtml() {
  const main = mainBoard(S.A);
  if (!main) return '<div class="kind">Firmware</div><h2>Code</h2><p class="desc">Add a board to generate code.</p>';
  const fam = BOARDS[main.type].family, langs = langsFor(fam);
  const lang = langs.includes(S.doc.lang) ? S.doc.lang : langs[0];
  const g = generate(S.A, lang); lastCode = g;
  let h = `<div class="kind">Firmware · ${esc(BOARDS[main.type].name)}</div><h2>${esc(g.file)}</h2>`;
  if (langs.length > 1) h += `<div class="seg langs">${langs.map((l) => `<button data-lang="${l}" class="${l === lang ? 'active' : ''}">${esc(LANGS[l])}</button>`).join('')}</div>`;
  h += '<div class="btnrow"><button class="btn primary" data-act="copy">Copy code</button><button class="btn" data-act="download">Download</button></div>';
  if (g.libs.length) h += `<h3>Libraries</h3><ul class="libs">${g.libs.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  if (g.notes.length) h += `<p class="note">${esc(g.notes.join(' '))}</p>`;
  const errs = S.A.issues.filter((i) => i.sev === 'error').length;
  if (errs) h += `<p class="note" style="color:#ffb0b0">${errs} error${errs > 1 ? 's' : ''} in the Check tab — parts with errors are left out of the code.</p>`;
  h += `<pre class="code mono">${highlight(g.code, g.lang)}</pre>`;
  return h;
}
function simHtml() {
  const A = S.A, names = instanceNames(A);
  let h = `<div class="kind">Simulation</div><h2>${S.running ? 'Running' : 'Simulate'}</h2>`;
  if (!S.running) h += `<div class="btnrow"><button class="btn primary" data-act="run">▶ Start simulation</button></div>`;
  // sensors
  const sensors = S.doc.items.filter((i) => defOf(i).vals && A.conn.get(i.uid));
  h += `<h3>Sensor inputs <small>${sensors.length}</small></h3>`;
  if (!sensors.length) h += '<p class="note">Add sensors and wire them to the board to get inputs here.</p>';
  for (const it of sensors) {
    const def = defOf(it), C = A.conn.get(it.uid), ok = C.ok && C.main;
    h += `<div class="ctrl ${S.focusSensor === it.uid ? 'focus' : ''}" data-ctrl="${it.uid}"><div class="t"><span>${esc(names.get(it.uid) || def.name)}</span><small>${ok ? esc(def.name) : '⚠ not wired correctly'}</small></div>`;
    for (const v of def.vals) {
      const val = sim.value(it.uid, v);
      if (v.bool) h += `<label>${esc(v.l)}<button class="tog ${val ? 'on' : ''}" data-tog="${it.uid}|${v.k}">${val ? 'ON' : 'OFF'}</button><output></output></label>`;
      else h += `<label>${esc(v.l)}<input type="range" min="${v.min}" max="${v.max}" step="${v.step}" value="${val}" data-val="${it.uid}|${v.k}" /><output>${fmtNum(val)} ${esc(v.u)}</output></label>`;
    }
    h += '</div>';
  }
  // outputs live state
  const outs = S.doc.items.filter((i) => defOf(i).out);
  if (outs.length) {
    h += `<h3>Outputs</h3><div class="outs" id="outs">${outs.map((it) => `<div data-out="${it.uid}"><i></i>${esc(names.get(it.uid) || defOf(it).name)}</div>`).join('')}</div>`;
  }
  // rules
  const srcs = []; for (const it of S.doc.items) { const def = defOf(it), C = A.conn.get(it.uid); if (!def.vals || !C) continue; for (const v of sensorVars(def, C)) srcs.push({ id: `${it.uid}.${v.k}`, l: `${names.get(it.uid)} · ${v.l}`, v }); }
  const dsts = outs.filter((it) => ACTIONS[defOf(it).out]);
  h += `<h3>Rules <small>IF sensor → THEN output</small></h3>`;
  for (const r of S.doc.rules || []) {
    const src = srcs.find((s) => s.id === r.src);
    const dst = S.doc.items.find((i) => i.uid === r.dst);
    const acts = dst ? ACTIONS[defOf(dst).out] || [] : [];
    h += `<div class="rule" data-rule="${r.uid}"><span>When</span><div class="row"><select data-rf="src">${srcs.map((s) => `<option value="${s.id}" ${s.id === r.src ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}${src ? '' : '<option selected>— pick a sensor —</option>'}</select></div>
      <span>is</span><div class="row">${src?.v.bool ? `<select data-rf="val"><option value="1" ${+r.val ? 'selected' : ''}>on / detected</option><option value="0" ${+r.val ? '' : 'selected'}>off</option></select>` : `<select data-rf="op"><option value="&gt;" ${r.op === '>' ? 'selected' : ''}>above</option><option value="&lt;" ${r.op === '<' ? 'selected' : ''}>below</option></select><input type="number" data-rf="val" value="${esc(r.val)}" step="any" />`}</div>
      <span>Then</span><div class="row"><select data-rf="dst">${dsts.map((d) => `<option value="${d.uid}" ${d.uid === r.dst ? 'selected' : ''}>${esc(names.get(d.uid) || defOf(d).name)}</option>`).join('')}</select><select data-rf="act">${acts.map(([k, l]) => `<option value="${k}" ${k === r.act ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${['angle', 'speed'].includes(r.act) ? `<input type="number" data-rf="arg" value="${esc(r.arg ?? (r.act === 'angle' ? 90 : 60))}" title="${r.act === 'angle' ? 'degrees' : '% speed'}" />` : r.act === 'color' ? `<input type="color" data-rf="arg" value="${esc(r.arg || '#00a0ff')}" />` : ''}</div>
      <button class="x" data-rdel="${r.uid}">remove</button></div>`;
  }
  h += `<div class="btnrow"><button class="btn" data-act="addrule" ${srcs.length && dsts.length ? '' : 'disabled'}>+ Add rule</button></div>`;
  h += '<p class="note">Otherwise the output turns off. Outputs without a rule run a demo: LEDs blink, servos sweep, NeoPixels show a rainbow, motors run at 60 %. Displays show the latest readings. Rules go into the generated code too.</p>';
  return h;
}
const fmtNum = (v) => (Math.abs(v) >= 100 ? Math.round(v) : (+v).toFixed(1));

$('#panel').addEventListener('click', (e) => {
  const t = e.target.closest('button, li[data-focus]'); if (!t) return;
  const act = t.dataset.act;
  if (act === 'delete') removeSel();
  else if (act === 'rotate') rotateSel();
  else if (act === 'focus') focusOn(S.sel);
  else if (act === 'autowire') autoWireSel();
  else if (act === 'main') { commit(); S.doc.main = S.sel; refresh(); toast('Main board changed'); }
  else if (act === 'copy') {
    if (navigator.clipboard) navigator.clipboard.writeText(lastCode?.code || '').then(() => toast('Code copied'), () => toast('Select the code and copy it'));
    else toast('Select the code and copy it');
  }
  else if (act === 'download') download(lastCode.file, lastCode.code, 'text/plain');
  else if (act === 'run') toggleRun();
  else if (act === 'addrule') addRule();
  else if (t.dataset.lang) { S.doc.lang = t.dataset.lang; renderPanel(); }
  else if (t.dataset.wcol) { commit(); const w = S.doc.wires.find((x) => `w:${x.uid}` === S.sel); w.color = t.dataset.wcol; refresh(); }
  else if (t.dataset.prop) { commit(); const it = S.doc.items.find((i) => i.uid === S.sel); it.props = { ...it.props, [t.dataset.prop]: t.dataset.val }; refresh(); }
  else if (t.dataset.tog) { const [uid, k] = t.dataset.tog.split('|'); const v = sim.value(uid, { k }); sim.set(uid, k, v ? 0 : 1); t.classList.toggle('on', !v); t.textContent = v ? 'OFF' : 'ON'; }
  else if (t.dataset.rdel) { commit(); S.doc.rules = S.doc.rules.filter((r) => r.uid !== t.dataset.rdel); refresh(); }
  else if (t.dataset.focus !== undefined) { if (t.dataset.focus) { S.sel = t.dataset.focus; refresh(); focusOn(t.dataset.focus); } }
});
$('#panel').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.val && t.type === 'range') { const [uid, k] = t.dataset.val.split('|'); sim.set(uid, k, +t.value); const def = defOf(S.doc.items.find((i) => i.uid === uid)); t.nextElementSibling.textContent = `${fmtNum(+t.value)} ${def.vals.find((v) => v.k === k).u}`; }
});
$('#panel').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.prop) { commit(); const it = S.doc.items.find((i) => i.uid === S.sel); it.props = { ...it.props, [t.dataset.prop]: t.value }; refresh(); }
  else if (t.dataset.main !== undefined) { commit(); S.doc.main = t.value; refresh(); }
  else if (t.dataset.rf) {
    const r = S.doc.rules.find((x) => x.uid === t.closest('[data-rule]').dataset.rule); commit();
    r[t.dataset.rf] = t.dataset.rf === 'val' || (t.dataset.rf === 'arg' && t.type === 'number') ? +t.value : t.value;
    if (t.dataset.rf === 'dst') { const d = S.doc.items.find((i) => i.uid === r.dst); r.act = ACTIONS[defOf(d).out][0][0]; r.arg = undefined; }
    if (t.dataset.rf === 'src') { const it = S.doc.items.find((i) => r.src.startsWith(`${i.uid}.`)); const v = sensorVars(defOf(it), S.A.conn.get(it.uid)).find((x) => r.src === `${it.uid}.${x.k}`); if (v?.bool) { r.op = 'is'; r.val = 1; } else { r.op = '>'; r.val = v ? +(((v.min ?? 0) + (v.max ?? 100)) / 2).toFixed(1) : 0; } }
    refresh();
  }
});
function addRule() {
  const A = S.A; let src = null;
  for (const it of S.doc.items) { const def = defOf(it), C = A.conn.get(it.uid); if (def.vals && C) { const v = sensorVars(def, C)[0]; src = { id: `${it.uid}.${v.k}`, v }; break; } }
  const dst = S.doc.items.find((i) => ACTIONS[defOf(i).out]);
  if (!src || !dst) return;
  commit();
  S.doc.rules = S.doc.rules || [];
  S.doc.rules.push({ uid: newUid('r'), src: src.id, op: src.v.bool ? 'is' : '>', val: src.v.bool ? 1 : +src.v.v, dst: dst.uid, act: ACTIONS[defOf(dst).out][0][0] });
  refresh();
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

// ── Simulation ─────────────────────────────────────────────────────────────
const sim = new Sim();
let audio = null, osc = null;
function toggleRun() {
  S.running = !S.running;
  $('#run').classList.toggle('on', S.running);
  $('#run-label').textContent = S.running ? 'Stop' : 'Simulate';
  $('#run-ico').setAttribute('d', S.running ? 'M6 6h12v12H6z' : 'M8 5v14l11-7z');
  if (S.running) { sim.t = 0; sim.lastPrint = -1; sim.serial.push(`--- ${BOARDS[mainBoard(S.A)?.type]?.name || 'board'} reset ---`); if ($('#serial').hidden) $('#t-serial').click(); setTab('sim', false); }
  else { resetOutputs(); beep(false); }
  renderPanel(); updateHint();
}
function resetOutputs() {
  for (const [uid, v] of views) {
    const H = v.H;
    if (H.lamp) { H.lamp.emissiveIntensity = 0; if (v.glow) v.glow.material.opacity = 0; }
    if (H.leds) for (const l of H.leds) if (l.f.pin || l.f.name === 'ind' || l.f.blink) l.m.material.emissiveIntensity = 0;
    if (H.pixels) for (const p of H.pixels) { p.material.emissive.set('#000000'); p.material.color.set('#f3f3f3'); }
    if (H.screen) drawScreen(H.screen, null);
    if (H.horn) H.horn.rotation.y = 0;
    void uid;
  }
}
function beep(on) {
  if (!S.sound) on = false;
  if (on && !audio) { try { audio = new AudioContext(); osc = audio.createOscillator(); const g = audio.createGain(); g.gain.value = 0.04; osc.type = 'square'; osc.frequency.value = 2300; osc.connect(g).connect(audio.destination); osc.start(); audio.suspend(); } catch { audio = null; } }
  if (!audio) return;
  if (on && audio.state !== 'running') audio.resume(); else if (!on && audio.state === 'running') audio.suspend();
}
let simAcc = 0, lastSim = null, panelAcc = 0;
function simFrame(dt) {
  simAcc += dt; panelAcc += dt;
  if (simAcc >= 0.05 || !lastSim) { lastSim = sim.tick(S.A, simAcc); simAcc = 0; if (lastSim.line) appendSerial(lastSim.line); }
  const r = lastSim; let anyBeep = false;
  for (const [uid, st] of r.outputs) {
    const v = views.get(uid); if (!v) continue; const H = v.H; const it = S.doc.items.find((i) => i.uid === uid);
    const on = st.ok && st.on;
    if (H.lamp) {
      let col = H.lampColor || '#ff3030';
      if (st.kind === 'rgb') { col = st.color || '#ffffff'; H.lamp.color.set(on ? col : '#f4f4f4'); H.lamp.emissive.set(col); }
      H.lamp.emissiveIntensity = on ? 1.5 : 0;
      if (v.glow) { v.glow.material.color.set(col); v.glow.material.opacity = on ? 0.4 : 0; }
    }
    if (st.kind === 'relay' && H.leds) for (const l of H.leds) if (l.f.name === 'ind') l.m.material.emissiveIntensity = on ? 2.4 : 0;
    if (st.kind === 'buzzer' && H.body) { const s = on ? 1 + Math.sin(performance.now() / 30) * 0.03 : 1; H.body.scale.set(s, 1, s); if (on) anyBeep = true; }
    if (st.kind === 'servo' && H.horn) { const target = -((st.angle ?? 0) - 90) * Math.PI / 180; H.horn.rotation.y += (target - H.horn.rotation.y) * Math.min(1, dt * 8); }
    if (st.kind === 'motor') { const sp = on ? (st.speed || 60) / 100 : 0; if (H.wheel) H.wheel.rotation.x += sp * dt * 18; if (H.shaft) H.shaft.rotation.z += sp * dt * 30; }
    if (st.kind === 'stepper' && H.shaft) { if (on) H.shaft.rotation.y += dt * 1.2; }
    if (st.kind === 'neopixel' && H.pixels) H.pixels.forEach((p, i) => { const m = p.material; if (!on) { m.emissive.set('#000000'); m.color.set('#f3f3f3'); return; } if (st.rainbow !== undefined) m.emissive.setHSL((i / 12 + st.rainbow * 0.2) % 1, 1, 0.5); else m.emissive.set(st.color || '#00a0ff'); m.color.copy(m.emissive); });
    if (st.kind === 'display' && H.screen && panelAcc > 0.25) drawScreen(H.screen, st.ok ? { lines: st.lines, value: st.value, level: st.level, title: it ? 'Proto Lab' : '' } : null);
  }
  beep(anyBeep);
  // inputs: animate controls
  for (const it of S.doc.items) {
    const v = views.get(it.uid); if (!v) continue;
    if (it.type === 'pot' && v.H.shaft) v.H.shaft.rotation.y = -((sim.value(it.uid, { k: 'pos', v: 50 }) / 100) * 270 - 135) * Math.PI / 180;
    if (it.type === 'button' && v.H.cap) { v.H.cap.userData.y0 ??= v.H.cap.position.y; v.H.cap.position.y = v.H.cap.userData.y0 - (sim.value(it.uid, { k: 'press' }) ? 1.2 : 0); }
    if (it.type === 'joystick' && v.H.stick) { v.H.stick.rotation.z = -sim.value(it.uid, { k: 'x', v: 0 }) / 100 * 0.4; v.H.stick.rotation.x = sim.value(it.uid, { k: 'y', v: 0 }) / 100 * 0.4; }
  }
  // board LEDs
  for (const it of S.doc.items) {
    const v = views.get(it.uid); if (!v?.H.leds || !BOARDS[it.type]) continue;
    for (const l of v.H.leds) if (l.f.pin) l.m.material.emissiveIntensity = r.boardLeds?.get(it.uid) ? 2.4 : 0;
  }
  if (panelAcc > 0.25) {
    panelAcc = 0;
    if (S.tab === 'sim') document.querySelectorAll('#outs [data-out]').forEach((d) => { const st = r.outputs.get(d.dataset.out); d.querySelector('i').className = !st?.ok ? 'x' : st.on ? 'on' : ''; });
  }
}
function appendSerial(line) {
  const out = $('#serial-out');
  out.textContent = sim.serial.slice(-120).join('\n');
  out.scrollTop = out.scrollHeight;
  void line;
}

// ── Top bar ────────────────────────────────────────────────────────────────
for (const [k, [name]] of Object.entries(EXAMPLES)) $('#example').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(name)}</option>`);
$('#example').addEventListener('change', (e) => { const k = e.target.value; if (!k) return; loadDoc(EXAMPLES[k][1](), `Loaded “${EXAMPLES[k][0]}”`); e.target.value = ''; });
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) { S.mode = m; S.pending = null; rubber.visible = false; document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m)); canvas.style.cursor = m === 'wire' ? 'crosshair' : 'default'; updateHint(); }
$('#undo').addEventListener('click', undo); $('#redo').addEventListener('click', redo);
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b)); fitAll(); }));
$('#fit').addEventListener('click', () => fitAll());
$('#new').addEventListener('click', () => { if (S.doc.items.length) undoStack.push(JSON.stringify(S.doc)); const keep = undoStack.slice(); loadDoc({ title: 'Untitled prototype' }, 'New project — pick a board from the library'); undoStack.push(...keep); updateUndo(); });
$('#save').addEventListener('click', () => download(`${(S.doc.title || 'prototype').replace(/\W+/g, '-').toLowerCase()}.json`, JSON.stringify(S.doc, null, 1), 'application/json'));
$('#open').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.items)) throw new Error('not a Proto Lab file'); loadDoc(d, `Opened ${f.name}`); } catch (err) { toast(`Could not open: ${err.message}`); } e.target.value = ''; });
$('#run').addEventListener('click', toggleRun);
$('#t-serial').addEventListener('click', (e) => { const s = $('#serial'); s.hidden = !s.hidden; e.currentTarget.classList.toggle('active', !s.hidden); appendSerial(); });
$('#serial-clear').addEventListener('click', () => { sim.serial.length = 0; appendSerial(); });
$('#t-sound').addEventListener('click', (e) => { S.sound = !S.sound; e.currentTarget.classList.toggle('active', S.sound); e.currentTarget.querySelector('span').textContent = S.sound ? 'Sound on' : 'Sound off'; if (!S.sound) beep(false); });
$('#t-labels').addEventListener('click', (e) => { S.pinInfo = !S.pinInfo; e.currentTarget.classList.toggle('active', S.pinInfo); });

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'w') setMode('wire');
  else if (k === 'v' || k === 'm') setMode('move');
  else if (k === 'r') rotateSel();
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeSel(); }
  else if (k === 'escape') { if (S.pending) { S.pending = null; rubber.visible = false; updateHint(); } else if (S.mode === 'wire') setMode('move'); else select(null); }
  else if (k === 'f') fitAll();
  else if (k === ' ') { e.preventDefault(); toggleRun(); }
});

// ── Render loop ────────────────────────────────────────────────────────────
function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas.parentElement);
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt * 2.2); const e = 1 - (1 - camAnim.t) ** 3;
    controls.target.lerpVectors(camAnim.ft, camAnim.tt, e); camera.position.lerpVectors(camAnim.fp, camAnim.tp, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  if (S.running) simFrame(dt);
  hoverRing.scale.setScalar(1 + Math.sin(now / 160) * 0.12);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ── Boot ───────────────────────────────────────────────────────────────────
function boot() {
  renderLibrary();
  resize();
  const starter = new URLSearchParams(location.search).get('starter');
  loadDoc(starterDoc(starter));
  requestAnimationFrame(loop);
  setTimeout(() => $('#loader').classList.add('done'), 150);
  reportStatus('ready');
}

function starterDoc(starter) {
  const board = { uid: 'esp32_1', type: 'esp32', x: -72, y: 0, rot: 0, props: {} };
  const bench = { uid: 'bb400_2', type: 'bb400', x: 20, y: 0, rot: 0, props: {} };
  const part = (type, y, props) => ({ uid: `${type}_${y}`, type, x: 91, y, rot: 0, props });
  if (starter === 'board') return { title: 'Explore the development board', items: [board], main: board.uid };
  if (starter === 'led') return {
    title: 'Build an LED circuit',
    items: [board, bench, part('led', -18, { color: 'Red' }), part('resistor', 18, { ohms: '220' })],
    main: board.uid,
  };
  if (starter === 'sensor') return {
    title: 'Build an ultrasonic sensor circuit',
    items: [board, bench, part('hcsr04', -25, {}), part('levelshift', 25, {})],
    main: board.uid,
  };
  return { title: 'Untitled prototype' };
}
// handle for automated browser tests
window.__protoLab = { S, pinPos, camera, canvas };
boot();
