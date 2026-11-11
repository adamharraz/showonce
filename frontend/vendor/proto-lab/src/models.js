/** Procedural 3D models of boards, modules, passives and breadboards. Local frame: x = def x, y = up, z = def y (mm). */
import * as THREE from 'three';
import { label } from './catalog/boards.js';
import { LED_COL } from './catalog/parts.js';
import { layout, BB_TOP, RAILS, rowY, ROWS } from './breadboard.js';

const PCB_T = 1.6;
const MAT = new Map();
export function mat(color, o = {}) {
  const k = `${color}|${o.metal ? 1 : 0}|${o.rough ?? ''}|${o.emissive ?? ''}|${o.opacity ?? ''}|${o.flat ? 1 : 0}`;
  if (!MAT.has(k)) MAT.set(k, new THREE.MeshStandardMaterial({ color, metalness: o.metal ? 0.85 : 0.05, roughness: o.rough ?? (o.metal ? 0.3 : 0.6), emissive: o.emissive || '#000000', transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, flatShading: !!o.flat }));
  return MAT.get(k);
}
const GOLD = () => mat('#d8b45a', { metal: true, rough: 0.25 });
const BLACK = () => mat('#151517', { rough: 0.7 });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function canvasTex(wpx, hpx, draw) {
  const c = document.createElement('canvas'); c.width = wpx; c.height = hpx;
  const g = c.getContext('2d'); draw(g, wpx, hpx);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return `#${c.getHexString()}`; }

/** Height (local) of the point where a wire attaches to a pin. */
export function pinTop(def) {
  if (def.breadboard) return BB_TOP;
  const h = def.header;
  if (h === 'female' || h === 'male-up') return PCB_T + 8.5;
  if (h === 'male') return PCB_T + 1.4;
  if (h === 'module' || h === 'rails') return PCB_T + 0.6;
  if (h === 'term') return 6;
  return 0.6;   // legs: just under the body
}
/** Height of the item's local origin above the bench. */
export function liftOf(def, onBB) {
  if (def.breadboard) return 0;
  if (def.kind === 'board') return def.bbFit ? (onBB ? BB_TOP + 2.5 : 8.5) : 3.5;
  if (def.header === 'module' || def.header === 'rails') return onBB ? BB_TOP + 2.5 : 8.5;
  if (def.header === 'legs') return onBB ? BB_TOP + 1.5 : 7;
  return 0;
}

// ── PCB with silkscreen ─────────────────────────────────────────────────────
function pcb(def) {
  const S = Math.min(10, 1400 / Math.max(def.w, def.h));
  const tex = canvasTex(Math.round(def.w * S), Math.round(def.h * S), (g, W, H) => {
    g.fillStyle = def.pcb; g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, 'rgba(255,255,255,.07)'); grad.addColorStop(1, 'rgba(0,0,0,.12)'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // traces
    g.strokeStyle = shade(def.pcb, 1.25); g.globalAlpha = 0.35; g.lineWidth = Math.max(1, S * 0.3);
    let seed = def.w * 13 + def.h * 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < (def.kind === 'board' ? 40 : 8); i++) { g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y); for (let k = 0; k < 3; k++) { if (rnd() > 0.5) x = rnd() * W; else y = rnd() * H; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
    const px = (x) => (x + def.w / 2) * S, py = (y) => (y + def.h / 2) * S;
    // pin labels
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = S * (def.kind === 'board' ? 1.25 : 1.5);
    g.font = `600 ${fs}px Inter, Arial, sans-serif`;
    for (const p of def.pins) {
      const t = label(p.n);
      if (def.header === 'male-up') continue;
      g.save(); g.translate(px(p.x), py(p.y));
      if (def.id === 'mega' && p.x > 40) { g.textAlign = p.x < 45 ? 'right' : 'left'; g.fillText(t, p.x < 45 ? -S * 1.6 : S * 1.6, 0); }
      else if (def.kind === 'board') { g.rotate(-Math.PI / 2); if (p.y < 0) { g.textAlign = 'right'; g.fillText(t, -S * 2.2, 0); } else { g.textAlign = 'left'; g.fillText(t, S * 2.2, 0); } }
      else g.fillText(t.slice(0, 5), 0, p.y > 0 ? -S * 2.6 : S * 2.6);
      g.restore();
      // pad
      g.fillStyle = '#d8c27a'; g.beginPath(); g.arc(px(p.x), py(p.y), S * 0.9, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffffff';
    }
    // name
    const name = def.silk || def.name;
    g.font = `700 ${S * (def.kind === 'board' ? 4.2 : 2)}px Inter, Arial, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,.92)';
    const ty = def.kind === 'board' ? H * 0.55 : H * 0.14;
    g.fillText(def.kind === 'board' ? name : name.split(' ')[0], W * (def.kind === 'board' ? 0.62 : 0.5), ty);
    // mounting holes
    if (def.kind === 'board' && !def.bbFit) for (const [hx, hy] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) { g.fillStyle = '#c9c39a'; g.beginPath(); g.arc(W * hx, H * hy, S * 1.8, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(W * hx, H * hy, S * 1.4, 0, 7); g.fill(); }
  });
  const side = mat(shade(def.pcb, 0.8));
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 });
  let m;
  if (def.round) { m = new THREE.Mesh(new THREE.CylinderGeometry(def.w / 2, def.w / 2, PCB_T, 48), [side, top, side]); tex.center.set(0.5, 0.5); }
  else m = new THREE.Mesh(box(def.w, PCB_T, def.h), [side, side, top, side, side, side]);
  m.position.y = PCB_T / 2; m.castShadow = m.receiveShadow = true;
  return m;
}

// ── Headers ────────────────────────────────────────────────────────────────
function headers(def, g) {
  const pins = def.pins, n = pins.length, h = def.header;
  const dummy = new THREE.Object3D();
  const inst = (geo, material, count, fn) => { const im = new THREE.InstancedMesh(geo, material, count); for (let i = 0; i < count; i++) { fn(dummy, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.castShadow = true; g.add(im); return im; };
  if (h === 'female') {
    inst(box(2.5, 8.5, 2.5), BLACK(), n, (d, i) => d.position.set(pins[i].x, PCB_T + 4.25, pins[i].y));
    inst(box(1, 0.1, 1), mat('#050505'), n, (d, i) => d.position.set(pins[i].x, PCB_T + 8.52, pins[i].y));
  } else if (h === 'male-up') {
    inst(box(2.5, 2.5, 2.5), BLACK(), n, (d, i) => d.position.set(pins[i].x, PCB_T + 1.25, pins[i].y));
    inst(box(0.64, 6, 0.64), GOLD(), n, (d, i) => d.position.set(pins[i].x, PCB_T + 5.5, pins[i].y));
  } else if (h === 'male' || h === 'module' || h === 'rails') {
    inst(box(2.5, 2.5, 2.5), BLACK(), n, (d, i) => d.position.set(pins[i].x, -1.25, pins[i].y));
    inst(box(0.64, 9.6, 0.64), GOLD(), n, (d, i) => d.position.set(pins[i].x, -8.5 + 4.8 + 0.4, pins[i].y));
  } else if (h === 'legs') {
    inst(new THREE.CylinderGeometry(0.25, 0.25, 7.5, 6), mat('#c8ccd2', { metal: true }), n, (d, i) => d.position.set(pins[i].x, -3.75 + 0.5, pins[i].y));
  } else if (h === 'term') {
    inst(box(3, 6, 3), mat('#2a6fd6'), n, (d, i) => d.position.set(pins[i].x, 3, pins[i].y));
    inst(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 12), mat('#c9ccd1', { metal: true }), n, (d, i) => d.position.set(pins[i].x, 6.1, pins[i].y));
  }
}

// ── Features ───────────────────────────────────────────────────────────────
function textTex(text, w, h, fg = '#d0d0d0', bg = null, bold = 600) {
  const S = 12;
  return canvasTex(Math.max(16, Math.round(w * S)), Math.max(16, Math.round(h * S)), (g, W, H) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = H * 0.42; g.font = `${bold} ${fs}px Inter, Arial, sans-serif`;
    while (g.measureText(text).width > W * 0.9 && fs > 4) { fs *= 0.9; g.font = `${bold} ${fs}px Inter, Arial, sans-serif`; }
    g.fillText(text, W / 2, H / 2);
  });
}
function feature(f, g, base, H) {
  const z0 = base + (f.z || 0);
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const t = f.t;
  if (t === 'box') {
    const ms = mat(f.c, { metal: f.metal });
    let m;
    if (f.label) { const top = new THREE.MeshStandardMaterial({ color: f.c, map: textTex(f.label, f.w, f.d, f.metal ? '#3a3a3a' : '#e8e8e8', f.c), roughness: 0.5, metalness: f.metal ? 0.6 : 0.05 }); m = new THREE.Mesh(box(f.w, f.h, f.d), [ms, ms, top, ms, ms, ms]); }
    else m = new THREE.Mesh(box(f.w, f.h, f.d), ms);
    m.position.set(f.x, z0 + f.h / 2, f.y); add(m);
    if (f.name) H[f.name] = m;
    if (f.name === 'card') m.material = mat('#202022');
    return;
  }
  if (t === 'chip') {
    const top = new THREE.MeshStandardMaterial({ color: f.c, map: f.label ? textTex(f.label, f.w, f.d, f.metal ? '#55585e' : '#bdbdbd', f.c) : null, roughness: f.metal ? 0.3 : 0.6, metalness: f.metal ? 0.7 : 0 });
    const s = mat(f.c, { metal: f.metal });
    const m = new THREE.Mesh(box(f.w, f.h, f.d), [s, s, top, s, s, s]); m.position.set(f.x, z0 + f.h / 2 + (f.dip ? 0.8 : 0), f.y);
    if (f.rot) m.rotation.y = (f.rot * Math.PI) / 180;
    add(m);
    if (f.dip) { const n = f.dip / 2; for (let i = 0; i < n; i++) for (const s2 of [-1, 1]) { const l = new THREE.Mesh(box(0.5, 1.6, 1.2), mat('#c8ccd2', { metal: true })); l.position.set(f.x - f.w / 2 + 1.27 + i * ((f.w - 2.54) / (n - 1)), z0 + 0.8, f.y + s2 * (f.d / 2 + 0.3)); g.add(l); } }
    return;
  }
  if (t === 'cyl') {
    const len = f.axis ? f.len || f.h : f.h;
    const geo = new THREE.CylinderGeometry(f.r, f.r, len, 28);
    const sideM = mat(f.c, { metal: f.metal });
    const topM = f.mesh ? new THREE.MeshStandardMaterial({ map: meshTex(), color: '#bfc3c8', metalness: 0.6, roughness: 0.5 }) : sideM;
    const m = new THREE.Mesh(geo, [sideM, topM, sideM]);
    if (f.axis === 'x') { m.rotation.z = Math.PI / 2; m.position.set(f.x, z0 + f.r, f.y); }
    else if (f.axis === 'y') { m.rotation.x = Math.PI / 2; m.position.set(f.x, z0 + f.r, f.y); }
    else m.position.set(f.x, z0 + len / 2, f.y);
    add(m); if (f.name) H[f.name] = m;
    return;
  }
  if (t === 'led') {
    const s = f.small ? 1.2 : 1.6;
    const color = new THREE.Color(f.c);
    const m = new THREE.Mesh(box(s, 0.6, s * 0.6), new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.5), emissive: color, emissiveIntensity: f.on || f.power ? 2.2 : 0, roughness: 0.3 }));
    m.position.set(f.x, z0 + 0.3, f.y); g.add(m);
    H.leds = H.leds || []; H.leds.push({ m, f });
    if (f.name) H[f.name] = m;
    return;
  }
  if (t === 'grille') {
    const tex = canvasTex(160, 200, (c, W, Hh) => { c.fillStyle = f.c; c.fillRect(0, 0, W, Hh); c.fillStyle = shade(f.c, 0.55); for (let r = 0; r < 9; r++) for (let k = 0; k < 6; k++) c.fillRect(14 + k * 23 + (r % 2) * 10, 14 + r * 20, 12, 10); });
    const s = mat(f.c); const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const m = new THREE.Mesh(box(f.w, f.h, f.d), [s, s, top, s, s, s]); m.position.set(f.x, z0 + f.h / 2, f.y); add(m); return;
  }
  if (t === 'dome') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(f.r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(f.c, { flat: true, rough: 0.35 }));
    m.position.set(f.x, z0, f.y); add(m);
    const ring = new THREE.Mesh(box(f.r * 2.1, 2, f.r * 2.1), mat(shade(f.c, 0.95))); ring.position.set(f.x, z0 + 1 - 2, f.y); if (f.r > 6) add(ring);
    return;
  }
  if (t === 'knob') {
    const b = new THREE.Mesh(box(6.5, 4.5, 6.5), mat(f.c)); b.position.set(f.x, z0 + 2.25, f.y); add(b);
    const k = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1, 16), mat('#d9d9d9', { metal: true })); k.position.set(f.x, z0 + 4.9, f.y); g.add(k); return;
  }
  if (t === 'ldr') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 20), [mat('#e8d9b0'), new THREE.MeshStandardMaterial({ map: ldrTex(), roughness: 0.4 }), mat('#e8d9b0')]); m.position.set(f.x, z0 + 4, f.y); add(m);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), mat('#c8ccd2', { metal: true })); l.position.set(f.x + s * 1.2, z0 + 1.5, f.y); g.add(l); }
    return;
  }
  if (t === 'screen') {
    const k = f.kind; const RES = { oled: [256, 128], lcd: [320, 80], seg7: [320, 128], matrix: [128, 128] }[k];
    const c = document.createElement('canvas'); [c.width, c.height] = RES;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    if (k !== 'oled') { tex.magFilter = THREE.LinearFilter; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(f.x, z0 + 0.6, f.y); g.add(m);
    if (k === 'oled') { const frame = new THREE.Mesh(box(f.w + 1, 0.5, f.d + 6), mat('#101012')); frame.position.set(f.x, z0 + 0.25, f.y + 1); g.add(frame); }
    H.screen = { c, g: c.getContext('2d'), tex, kind: k };
    drawScreen(H.screen, null);
    return;
  }
  if (t === 'pixels') {
    H.pixels = [];
    for (let i = 0; i < f.n; i++) {
      const a = (i / f.n) * Math.PI * 2;
      const m = new THREE.Mesh(box(5, 1.6, 5), new THREE.MeshStandardMaterial({ color: '#f3f3f3', emissive: '#000000', emissiveIntensity: 2, roughness: 0.3 }));
      m.position.set(f.x + Math.cos(a) * f.r, z0 + 0.8, f.y + Math.sin(a) * f.r); m.rotation.y = -a; g.add(m); H.pixels.push(m);
    }
    return;
  }
  if (t === 'horn') {
    const pivot = new THREE.Group(); pivot.position.set(f.x, z0, f.y); g.add(pivot);
    const arm = new THREE.Mesh(box(20, 1.5, 4.5), mat('#f4f4f4')); arm.position.x = 7; arm.castShadow = true; pivot.add(arm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2, 20), mat('#f4f4f4')); pivot.add(hub);
    H.horn = pivot; return;
  }
  if (t === 'led5') {
    const lamp = new THREE.MeshPhysicalMaterial({ color: '#ff2b2b', emissive: '#ff2b2b', emissiveIntensity: 0, roughness: 0.15, transmission: 0.2, transparent: true, opacity: 0.88, thickness: 2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 6, 24), lamp); body.position.set(f.x, z0 + 3.6, f.y);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lamp); top.position.set(f.x, z0 + 6.6, f.y);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1, 24), lamp); rim.position.set(f.x, z0 + 0.5, f.y);
    g.add(body, top, rim); H.lamp = lamp; H.lampDiffused = !!f.diffused;
    return;
  }
  if (t === 'resistor') {
    const tex = canvasTex(128, 32, (c) => { c.fillStyle = '#d9c39a'; c.fillRect(0, 0, 128, 32); });
    const bodyM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 6.3, 18), bodyM); b.rotation.z = Math.PI / 2; b.position.set(f.x, z0 + 1.5, f.y); add(b);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.2, 6), mat('#c8ccd2', { metal: true })); l.rotation.z = Math.PI / 2; l.position.set(f.x + s * 4.2, z0 + 1.5, f.y); g.add(l); const v = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6), mat('#c8ccd2', { metal: true })); v.position.set(f.x + s * 5.08, z0 + 0.7, f.y); g.add(v); }
    H.resistorTex = tex; return;
  }
  if (t === 'traces') {
    const tex = canvasTex(256, 256, (c, W, Hh) => {
      c.clearRect(0, 0, W, Hh); c.strokeStyle = '#d6c27a'; c.lineWidth = 6;
      if (f.coil) for (let i = 0; i < 4; i++) c.strokeRect(14 + i * 14, 14 + i * 14, W - 28 - i * 28, Hh - 28 - i * 28);
      else if (f.ant) { c.beginPath(); c.moveTo(20, Hh - 20); for (let i = 0; i < 6; i++) { c.lineTo(20 + i * 38, 30); c.lineTo(39 + i * 38, 30); c.lineTo(39 + i * 38, Hh - 30); c.lineTo(58 + i * 38, Hh - 30); } c.stroke(); }
      else for (let i = 0; i < 10; i++) { c.fillStyle = '#d6c27a'; c.fillRect(20 + i * 22, 10, 9, Hh - 20); }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.7, roughness: 0.3 }));
    m.rotation.x = -Math.PI / 2; m.position.set(f.x, z0 + 0.05, f.y); g.add(m); return;
  }
}
let MESHTEX = null, LDRTEX = null;
function meshTex() { return (MESHTEX ||= canvasTex(128, 128, (c) => { c.fillStyle = '#9ea3aa'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#3a3d42'; c.lineWidth = 2; for (let i = 0; i < 128; i += 6) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 128); c.moveTo(0, i); c.lineTo(128, i); c.stroke(); } })); }
function ldrTex() { return (LDRTEX ||= canvasTex(64, 64, (c) => { c.fillStyle = '#c96a2a'; c.beginPath(); c.arc(32, 32, 32, 0, 7); c.fill(); c.strokeStyle = '#f0e0b0'; c.lineWidth = 4; c.beginPath(); for (let i = 0; i < 6; i++) { c.moveTo(12, 10 + i * 8); c.lineTo(52, 14 + i * 8); } c.stroke(); })); }

/** Draw display content. data = { lines: [..], value, level, on } */
export function drawScreen(S, data) {
  const { g, c, kind } = S, W = c.width, H = c.height;
  if (kind === 'oled') {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
    if (data?.lines) {
      g.fillStyle = '#7fd8ff'; g.fillRect(0, 0, W, 26); g.fillStyle = '#04121a'; g.font = '700 18px JetBrains Mono, monospace'; g.textBaseline = 'top'; g.fillText(data.title || 'Proto Lab', 6, 4);
      g.fillStyle = '#d8f4ff'; g.font = '500 17px JetBrains Mono, monospace';
      data.lines.slice(0, 5).forEach((l, i) => g.fillText(l.slice(0, 22), 6, 32 + i * 19));
    }
  } else if (kind === 'lcd') {
    g.fillStyle = data?.lines ? '#2f6fe0' : '#1d3f80'; g.fillRect(0, 0, W, H);
    g.font = '600 28px JetBrains Mono, monospace'; g.textBaseline = 'top';
    for (let r = 0; r < 2; r++) for (let k = 0; k < 16; k++) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(8 + k * 19, 8 + r * 36, 17, 30); }
    if (data?.lines) { g.fillStyle = '#eaf4ff'; data.lines.slice(0, 2).forEach((l, i) => { const s = l.padEnd(16).slice(0, 16); for (let k = 0; k < 16; k++) g.fillText(s[k], 9 + k * 19, 10 + i * 36); }); }
  } else if (kind === 'seg7') {
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
    const txt = data?.value !== undefined ? String(data.value).padStart(4, ' ').slice(-4) : '    ';
    for (let d = 0; d < 4; d++) seg(g, 18 + d * 76, 14, txt[d], !!data);
    if (data) { g.fillStyle = (Date.now() / 500) % 2 > 1 ? '#ff3b30' : '#3a1010'; g.beginPath(); g.arc(160, 48, 5, 0, 7); g.arc(160, 82, 5, 0, 7); g.fill(); }
  } else if (kind === 'matrix') {
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
    const lvl = data?.level ?? -1;
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const on = data?.grid ? data.grid[r][k] : r >= 8 - lvl; g.fillStyle = on ? '#ff3b30' : '#2a0d0d'; g.beginPath(); g.arc(8 + k * 16, 8 + r * 16, 6, 0, 7); g.fill(); }
  }
  S.tex.needsUpdate = true;
}
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
function seg(g, x, y, ch, lit) {
  const on = SEGS[ch] ?? '';
  const P = { a: [8, 0, 40, 9], b: [46, 6, 9, 40], c: [46, 54, 9, 40], d: [8, 92, 40, 9], e: [0, 54, 9, 40], f: [0, 6, 9, 40], g: [8, 46, 40, 9] };
  for (const [k, r] of Object.entries(P)) { g.fillStyle = lit && on.includes(k) ? '#ff3b30' : '#2a0d0d'; g.fillRect(x + r[0], y + r[1], r[2], r[3]); }
}

// ── Builders ───────────────────────────────────────────────────────────────
export function buildItem(def, props = {}) {
  const g = new THREE.Group(); const H = {};
  if (def.breadboard) { buildBreadboard(def, g); return { group: g, H }; }
  const hasPcb = !!def.pcb;
  if (hasPcb) g.add(pcb(def));
  headers(def, g);
  const base = hasPcb ? PCB_T : 0;
  for (const f of def.feats || []) feature(f, g, base, H);
  // per-instance props
  if (def.id === 'led') setLedColor(H, LED_COL[props.color || 'Red']);
  if (def.id === 'rgbled') setLedColor(H, '#f4f4f4');
  if (def.id === 'button' && props.cap) { const cap = g.children.find((m) => m.geometry?.type === 'CylinderGeometry'); if (cap) cap.material = mat(props.cap); }
  if (def.id === 'resistor') paintBands(H.resistorTex, props.ohms || '220');
  if (def.id === 'servo') { for (const [i, c] of (def.wires || []).entries()) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 13, 8), mat(c)); w.rotation.x = Math.PI / 2; w.position.set(def.pins[i].x, PCB_T + 0.6, -2); g.add(w); } }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, H };
}
export function setLedColor(H, c) { if (!H.lamp) return; H.lamp.color.set(c); H.lamp.emissive.set(c); H.lampColor = c; }
const BAND = ['#000000', '#7a4a1e', '#e0262b', '#ff8a1f', '#ffd23f', '#2fbf4a', '#2a6fd6', '#8a3cbf', '#8a8a8a', '#ffffff'];
function paintBands(tex, ohmsLabel) {
  const v = { 100: 100, 220: 220, 330: 330, '1k': 1000, '4.7k': 4700, '10k': 10000, '100k': 100000 }[ohmsLabel] || 220;
  const s = String(v), d1 = +s[0], d2 = +s[1], mul = s.length - 2;
  const c = tex.image.getContext('2d');
  c.fillStyle = '#d9c39a'; c.fillRect(0, 0, 128, 32);
  [[d1, 22], [d2, 40], [mul, 58]].forEach(([d, x]) => { c.fillStyle = BAND[d]; c.fillRect(x, 0, 10, 32); });
  c.fillStyle = '#c9a43a'; c.fillRect(96, 0, 10, 32);
  tex.needsUpdate = true;
}

function buildBreadboard(def, g) {
  const L = layout(def.breadboard), W = def.w, D = def.h;
  const S = 8;
  const tex = canvasTex(Math.round(W * S), Math.round(D * S), (c, w, h) => {
    c.fillStyle = '#f2f1ec'; c.fillRect(0, 0, w, h);
    const px = (x) => (x + W / 2) * S, py = (y) => (y + D / 2) * S;
    c.fillStyle = '#e4e2da'; c.fillRect(0, py(-1.6), w, 3.2 * S);    // centre channel
    for (const R of RAILS) { c.fillStyle = R.sign === '+' ? '#e0262b' : '#2a6fd6'; const off = R.side === 'top' ? (R.sign === '+' ? -2.1 : 2.1) : (R.sign === '+' ? -2.1 : 2.1); c.fillRect(px(-W / 2 + 4), py(R.y + off) - 2, (W - 8) * S, 3); c.font = `700 ${S * 2.4}px Inter, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(R.sign === '+' ? '+' : '−', px(-W / 2 + 2.2), py(R.y)); c.fillText(R.sign === '+' ? '+' : '−', px(W / 2 - 2.2), py(R.y)); }
    c.fillStyle = '#9a9890'; c.font = `600 ${S * 1.5}px Inter, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let r = 0; r < 10; r++) { c.fillText(ROWS[r], px(L.cx(1) - 2.6), py(rowY(r))); c.fillText(ROWS[r], px(L.cx(L.cols) + 2.6), py(rowY(r))); }
    for (let col = 1; col <= L.cols; col++) if (col === 1 || col % 5 === 0) { c.fillText(String(col), px(L.cx(col)), py(rowY(9) - 2.6)); c.fillText(String(col), px(L.cx(col)), py(rowY(0) + 2.6)); }
  });
  const side = mat('#e9e8e2');
  const body = new THREE.Mesh(box(W, BB_TOP, D), [side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), side, side, side]);
  body.position.y = BB_TOP / 2; body.receiveShadow = true; body.castShadow = true; g.add(body);
  const holes = new THREE.InstancedMesh(box(1.15, 0.12, 1.15), mat('#2b2b2d', { rough: 0.9 }), L.holes.length);
  const d = new THREE.Object3D();
  L.holes.forEach((h, i) => { d.position.set(h.x, BB_TOP + 0.02, h.y); d.updateMatrix(); holes.setMatrixAt(i, d.matrix); });
  g.add(holes);
}
