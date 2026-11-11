/**
 * Behavioural simulation. It mirrors the generated program: read every working sensor, apply
 * the rules (or each output's default demo), refresh displays and print a serial line.
 */
import { defOf, mainBoard } from './circuit.js';
import { sensorVars, instanceNames } from './codegen.js';
import { BOARDS, label } from './catalog/boards.js';

export const DEFAULT_ACT = { led: 'blink', servo: 'sweep', neopixel: 'rainbow', rgb: 'cycle', stepper: 'on', motor: 'speed', buzzer: 'off', relay: 'off' };
const fmt = (v, bool) => (bool ? (v ? 'yes' : 'no') : Math.abs(v) >= 1000 ? Math.round(v).toString() : (+v).toFixed(1));

export class Sim {
  constructor() { this.t = 0; this.values = {}; this.serial = []; this.lastPrint = -1; this.running = false; }
  value(uid, v) { const k = `${uid}.${v.k}`; return this.values[k] ?? v.v ?? 0; }
  set(uid, k, val) { this.values[`${uid}.${k}`] = val; }

  /** Evaluate one tick. Returns {outputs: Map uid→state, readings, displays, boardLeds}. */
  tick(A, dt) {
    this.t += dt;
    const t = this.t, main = mainBoard(A), names = instanceNames(A);
    const out = new Map(), readings = [], vars = new Map();
    if (!main) return { outputs: out, readings };
    for (const it of A.doc.items) {
      const def = defOf(it); const C = A.conn.get(it.uid);
      if (!C || !def.vals || !(C.ok && C.main)) continue;
      for (const v of sensorVars(def, C)) {
        let val;
        if (v.from) { const raw = this.value(it.uid, def.vals.find((x) => x.k === v.from.k)); val = v.from.above !== undefined ? raw > v.from.above : raw < v.from.below; }
        else val = this.value(it.uid, v);
        if (v.bool) val = !!val;
        vars.set(`${it.uid}.${v.k}`, { ...v, val, uid: it.uid, n: names.get(it.uid) });
        readings.push({ uid: it.uid, n: names.get(it.uid), k: v.k, l: v.l, u: v.u, val, bool: v.bool, min: v.min, max: v.max });
      }
    }
    // outputs
    const rules = (A.doc.rules || []);
    for (const it of A.doc.items) {
      const def = defOf(it); if (!def.out) continue;
      const C = A.conn.get(it.uid);
      const st = { kind: def.out, ok: !!(C?.ok && (C.main || def.id === 'motor' || alwaysOn(C))), on: false };
      out.set(it.uid, st);
      if (!st.ok) continue;
      if (def.out === 'display') continue;
      if (alwaysOn(C)) { st.on = true; if (def.out === 'rgb') st.color = '#ffffff'; continue; }
      if (def.id === 'motor') { st.on = true; st.speed = 100; continue; }
      const mine = rules.filter((r) => r.dst === it.uid && vars.has(r.src));
      let act = 'off', arg;
      if (mine.length) {
        for (const r of mine) {
          const v = vars.get(r.src);
          const cond = v.bool ? (r.op === 'is' && !+r.val ? !v.val : !!v.val) : r.op === '<' ? v.val < +r.val : v.val > +r.val;
          if (cond) { act = r.act || 'on'; arg = r.arg; }
        }
      } else act = DEFAULT_ACT[def.out] || 'off';
      apply(st, act, arg, t);
    }
    // displays
    const shown = [...vars.values()];
    for (const it of A.doc.items) {
      const def = defOf(it); if (def.out !== 'display') continue;
      const st = out.get(it.uid); if (!st.ok) continue;
      st.on = true;
      const lines = shown.slice(0, 5).map((v) => `${v.l.slice(0, 10)}: ${fmt(v.val, v.bool)}${v.u && !v.bool ? ` ${v.u}` : ''}`);
      if (def.id === 'lcd1602') st.lines = shown.length ? shown.slice(0, 2).map((v) => `${v.l.slice(0, 7)} ${fmt(v.val, v.bool)}${v.bool ? '' : (v.u || '').replace('°', '').slice(0, 3)}`) : ['Proto Lab', 'ready'];
      else if (def.id === 'tm1637') { const v = shown.find((x) => !x.bool); st.value = v ? Math.round(v.val) : Math.floor(t) % 10000; }
      else if (def.id === 'max7219') { const v = shown.find((x) => !x.bool); st.level = v ? Math.max(0, Math.min(8, Math.round(((v.val - v.min) / (v.max - v.min)) * 8))) : Math.floor(t * 5) % 9; }
      else st.lines = lines.length ? lines : ['ready'];
    }
    // board LEDs that share a pin with an active output
    const boardLeds = new Map();
    for (const [uid, st] of out) {
      if (!st.on) continue;
      const C = A.conn.get(uid);
      for (const b of Object.values(C?.pins || {})) if (b?.p && BOARDS[b.it.type]?.builtinLed === b.n) boardLeds.set(b.uid, true);
    }
    // serial line once per second
    let line = null;
    if (Math.floor(t) !== this.lastPrint) {
      this.lastPrint = Math.floor(t);
      line = readings.length ? readings.map((r) => `${r.n}.${r.k}=${r.bool ? (r.val ? 1 : 0) : +(+r.val).toFixed(2)}`).join('  ') : `[${BOARDS[main.type].name}] running — no sensors wired yet`;
      this.serial.push(line); if (this.serial.length > 200) this.serial.shift();
    }
    return { outputs: out, readings, boardLeds, line };
  }
}
function alwaysOn(C) { return C && Object.values(C.pins).some((p) => p && p.supply); }
function apply(st, act, arg, t) {
  switch (act) {
    case 'on': st.on = true; break;
    case 'blink': st.on = Math.floor(t * 2) % 2 === 0; break;
    case 'sweep': st.on = true; st.angle = Math.abs(((t * 66) % 360) - 180); break;
    case 'angle': st.on = true; st.angle = +arg || 90; break;
    case 'speed': st.on = true; st.speed = +arg || 60; break;
    case 'color': st.on = true; st.color = arg || '#00a0ff'; break;
    case 'rainbow': st.on = true; st.rainbow = t; break;
    case 'cycle': st.on = true; st.color = `hsl(${Math.round((t * 60) % 360)}, 100%, 55%)`; break;
    default: st.on = false; st.angle = st.kind === 'servo' ? 0 : st.angle;
  }
}
export { label };
