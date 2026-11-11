/**
 * Circuit analysis: pin positions, breadboard plugging, nets (union-find), electrical rule
 * check and the mapping of every module pin to a controller pin.
 */
import { BOARDS, label } from './catalog/boards.js';
import { PARTS, OHMS, LED_COL } from './catalog/parts.js';
import { layout, holeLabel } from './breadboard.js';

const P = 2.54;
export const defOf = (it) => BOARDS[it.type] || PARTS[it.type];
export const POWER = {
  uno: { p5: 500, p33: 150, vin: [7, 12] }, nano: { p5: 500, p33: 50, vin: [7, 12] }, mega: { p5: 500, p33: 150, vin: [7, 12] },
  esp32: { p5: 500, p33: 350 }, nodemcu: { p5: 500, p33: 300 }, pico: { p5: 500, p33: 300, vin: [1.8, 5.5] },
  pi5: { p5: 1000, p33: 300 }, pizero: { p5: 600, p33: 300 },
};
const SIGNAL = new Set(['do', 'di', 'dio', 'ao', 'pwm', 'servo', 'tone', 'sda', 'scl', 'mosi', 'miso', 'sck', 'cs', 'tx', 'rx']);
const OUTGOING = new Set(['do', 'dio', 'ao', 'miso', 'tx']);          // module drives the line
const INCOMING = new Set(['di', 'dio', 'pwm', 'servo', 'tone', 'mosi', 'sck', 'cs', 'rx']);   // board drives it
const BUS = new Set(['sda', 'scl', 'mosi', 'miso', 'sck']);
export const isSignal = (t) => SIGNAL.has(t);
const fmtV = (v) => `${+v.toFixed(1)} V`;

export function rotXY(it, x, y) {
  const th = (it.rot || 0) * Math.PI / 2, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  return [it.x + x * c - y * s, it.y + x * s + y * c];
}
export function canPlug(def) { return def.kind === 'part' ? ['module', 'legs', 'rails'].includes(def.header) : def.kind === 'board' && !!def.bbFit; }
export function pinLabel(def, n) { return def.breadboard ? holeLabel(n) : label(n); }
export function voltOf(it, def, pin) {
  if (def.battery) return def.battery;
  if (def.psu) return +((it.props || {})[pin.side] || PARTS.mb102.props[pin.side].def);
  return 0;
}

/** Analyse a document. Cheap enough to run after every edit. */
export function analyze(doc) {
  const items = new Map(doc.items.map((it) => [it.uid, it]));
  const pins = new Map();
  const add = (it, def, p, extra) => {
    const [wx, wy] = rotXY(it, p.x, p.y);
    const key = `${it.uid}:${p.n}`;
    pins.set(key, { key, uid: it.uid, it, def, p, n: p.n, wx, wy, ...extra });
  };
  const bbs = [];
  for (const it of doc.items) {
    const def = defOf(it); if (!def) continue;
    if (def.breadboard) {
      const L = layout(def.breadboard); const grid = new Map();
      for (const h of L.holes) { add(it, def, h, { kind: 'hole' }); grid.set(`${Math.round(h.x * 2 / P)},${Math.round(h.y * 2 / P)}`, h); }
      bbs.push({ it, def, grid });
    } else for (const p of def.pins) add(it, def, p, { kind: def.kind === 'board' ? 'board' : 'part' });
  }
  // ── plugging into breadboards ──
  const plugged = new Map(), occupied = new Map(), onBB = new Map();
  for (const pin of pins.values()) {
    if (pin.kind === 'hole' || !canPlug(pin.def)) continue;
    for (const bb of bbs) {
      const th = -(bb.it.rot || 0) * Math.PI / 2, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
      const dx = pin.wx - bb.it.x, dy = pin.wy - bb.it.y, lx = dx * c - dy * s, ly = dx * s + dy * c;
      const h = bb.grid.get(`${Math.round(lx * 2 / P)},${Math.round(ly * 2 / P)}`);
      if (h && Math.abs(h.x - lx) < 0.45 && Math.abs(h.y - ly) < 0.45) {
        const hk = `${bb.it.uid}:${h.n}`;
        plugged.set(pin.key, hk); occupied.set(hk, pin.key); onBB.set(pin.uid, bb.it.uid);
        break;
      }
    }
  }
  // ── union-find ──
  const parent = new Map();
  const find = (k) => { let r = k; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r); let x = k; while (x !== r) { const nx = parent.get(x) ?? r; parent.set(x, r); x = nx; } return r; };
  const union = (a, b) => { if (!pins.has(a) || !pins.has(b)) return; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const k of pins.keys()) parent.set(k, k);
  for (const bb of bbs) {
    const first = {};
    for (const h of layout(bb.def.breadboard).holes) { const k = `${bb.it.uid}:${h.n}`; if (first[h.g]) union(k, first[h.g]); else first[h.g] = k; }
  }
  for (const [a, b] of plugged) union(a, b);
  const wires = [];
  for (const w of doc.wires) { if (pins.has(w.a) && pins.has(w.b)) { union(w.a, w.b); wires.push(w); } }
  for (const it of doc.items) {
    const def = defOf(it); if (!def || def.breadboard) continue;
    const byLabel = {};
    for (const p of def.pins) {
      const L = label(p.n), k = `${it.uid}:${p.n}`;
      const same = def.kind === 'board' ? ['GND', 'AGND', '5V', '3V3', 'RST', 'RESET'].includes(L) : L === 'GND';
      if (same) { const key = L === 'AGND' ? 'GND' : L; if (byLabel[key]) union(k, byLabel[key]); else byLabel[key] = k; }
    }
    for (const [a, b] of def.bridges || []) union(`${it.uid}:${a}`, `${it.uid}:${b}`);
    if (def.psu) union(`${it.uid}:T-`, `${it.uid}:B-`);
  }
  const nets = new Map(), netOf = new Map();
  for (const k of pins.keys()) { const r = find(k); if (!nets.has(r)) nets.set(r, []); nets.get(r).push(k); netOf.set(k, r); }

  const A = { doc, items, pins, plugged, occupied, onBB, nets, netOf, wires, issues: [], conn: new Map() };
  summarizeNets(A);
  erc(A);
  return A;
}

function summarizeNets(A) {
  A.info = new Map();
  for (const [id, keys] of A.nets) {
    const I = { id, keys, gpio: [], src: [], gndRef: false, vin: [], parts: [], connected: 0 };
    for (const k of keys) {
      const pin = A.pins.get(k);
      if (pin.kind === 'hole') continue;
      I.connected++;
      if (pin.kind === 'board') {
        const r = pin.p.role;
        if (r === 'gpio' || r === 'flash') I.gpio.push(pin);
        else if (r === 'p5') I.src.push({ v: 5, pin, kind: 'board' });
        else if (r === 'p33') I.src.push({ v: 3.3, pin, kind: 'board' });
        else if (r === 'gnd') I.gndRef = true;
        else if (r === 'vin') I.vin.push(pin);
      } else {
        const t = pin.p.t;
        if (t === 'src') I.src.push({ v: voltOf(pin.it, pin.def, pin.p), pin, kind: pin.def.psu ? 'psu' : 'bat' });
        else if (t === 'gnd' && (pin.def.psu || pin.def.battery)) I.gndRef = true;
        I.parts.push(pin);
      }
    }
    const vs = [...new Set(I.src.map((s) => s.v))];
    I.v = vs.length === 1 ? vs[0] : vs.length ? Math.max(...vs) : 0;
    I.multiV = vs.length > 1;
    A.info.set(id, I);
  }
  A.net = (key) => A.info.get(A.netOf.get(key));
}

/** The board treated as the controller for code generation and simulation. */
export function mainBoard(A) {
  const d = A.doc;
  const it = (d.main && A.items.get(d.main)) || d.items.find((x) => BOARDS[x.type]);
  return it && BOARDS[it.type] ? it : null;
}

// ── Electrical rule check ──────────────────────────────────────────────────
function erc(A) {
  const I = A.issues;
  const push = (sev, uid, msg, extra = {}) => I.push({ sev, uid, msg, ...extra });
  const main = mainBoard(A);
  const name = (it) => it.name || defOf(it).name;

  // nets: shorts, mixed supplies, GPIO tied to rails
  for (const n of A.info.values()) {
    if (n.src.length && n.gndRef) push('error', n.src[0].pin.uid, `Short circuit: ${srcName(n.src[0])} is wired straight to GND.`, { net: n.id });
    else if (n.multiV) push('error', n.src[0].pin.uid, `Two different supplies (${[...new Set(n.src.map((s) => fmtV(s.v)))].join(' and ')}) are joined on one net.`, { net: n.id });
    const boardSrc = n.src.filter((s) => s.kind === 'board'), ext = n.src.filter((s) => s.kind !== 'board');
    if (boardSrc.length && ext.length && !n.multiV) push('warn', ext[0].pin.uid, `External supply drives ${label(boardSrc[0].pin.n)} of ${name(boardSrc[0].pin.it)} — back-powering while USB is connected is risky.`);
    for (const g of n.gpio) {
      if (n.src.length) push('warn', g.uid, `${label(g.n)} is tied directly to ${fmtV(n.v)} — set it as OUTPUT LOW and it shorts the supply.`);
      if (n.gndRef) push('warn', g.uid, `${label(g.n)} is tied directly to GND.`);
    }
    for (const vin of n.vin) {
      const lim = POWER[vin.it.type]?.vin; const v = n.v;
      if (lim && v && (v < lim[0] || v > lim[1])) push(v > lim[1] ? 'error' : 'warn', vin.uid, `${label(vin.n)} of ${name(vin.it)} expects ${lim[0]}–${lim[1]} V but gets ${fmtV(v)}.`);
    }
    for (const s of n.src) if (s.kind !== 'board') for (const b of [...n.src.filter((x) => x.kind === 'board')]) if (s.v > b.v + 0.3) push('error', b.pin.uid, `${fmtV(s.v)} from ${name(s.pin.it)} reaches the ${label(b.pin.n)} pin of ${name(b.pin.it)} — this will damage the board.`);
  }

  // ground domains
  const gndNets = [...A.info.values()].filter((n) => n.gndRef);
  const boardGnd = (b) => b && A.netOf.get(`${b.uid}:${defOf(b).pins.find((p) => label(p.n) === 'GND' || label(p.n) === 'AGND').n}`);
  const mainGnd = main ? boardGnd(main) : null;

  // parts
  for (const it of A.doc.items) {
    const def = defOf(it); if (!def || def.kind !== 'part') continue;
    const C = { uid: it.uid, pins: {}, ok: true, v: 0, issues: [] };
    A.conn.set(it.uid, C);
    const pk = (n) => `${it.uid}:${n}`;
    const net = (n) => A.net(pk(n));
    const anyConn = def.pins.some((p) => net(p.n).connected > 1 || A.plugged.has(pk(p.n)) && net(p.n).connected > 1);
    const fail = (sev, msg, extra) => { push(sev, it.uid, msg, extra); if (sev === 'error') C.ok = false; };
    if (def.psu || def.battery) continue;
    if (def.passive === 'resistor') continue;

    // supply
    const vccPins = def.pins.filter((p) => p.t === 'vcc' || p.t === 'lvref' || p.t === 'hvref');
    for (const p of vccPins) {
      const n = net(p.n);
      if (!n.v) { if (anyConn) fail('warn', `${name(it)}: ${p.n} is not powered.`); C.ok = false; continue; }
      if (p.t === 'vcc') C.v = n.v;
      if (p.t === 'lvref') C.lv = n.v; if (p.t === 'hvref') C.hv = n.v;
      if (def.vmax && n.v > def.vmax + 0.05) fail('error', `${name(it)} is rated ${def.vmin}–${def.vmax} V but its ${p.n} pin gets ${fmtV(n.v)} — it will be damaged.`, { fix: def.vmax < 4 ? 'Power it from 3V3.' : undefined });
      else if (def.vmin && n.v < def.vmin - 0.05) fail('warn', `${name(it)} needs at least ${def.vmin} V on ${p.n} (gets ${fmtV(n.v)}) — it may not work reliably.`, { fix: 'Power it from 5V.' });
    }
    if (def.shifter && C.lv && C.hv && C.lv > C.hv) fail('warn', `${name(it)}: LV (${fmtV(C.lv)}) should be the lower voltage.`);
    // ground
    const gp = def.pins.filter((p) => p.t === 'gnd');
    let gNet = null;
    for (const p of gp) { const n = net(p.n); if (!n.gndRef) { if (anyConn) fail('warn', `${name(it)}: ${p.n} is not connected to ground.`); C.ok = false; } else gNet = n.id; }

    // signals
    let usesMain = false;
    for (const p of def.pins) {
      const t = p.t;
      if (t === 'a' || t === 'k' || t === 'sw' || t === 'motor' || t === 'p') continue;
      if (!isSignal(t) && t !== 'ain') continue;
      const n = net(p.n);
      if (t === 'ain') continue;
      const board = n.gpio[0];
      if (!board) {
        // analog via an ADS1115 channel
        const ads = t === 'ao' && n.parts.find((x) => x.p.t === 'ain');
        if (ads) { C.pins[p.n] = { ads: ads.uid, ch: +ads.n.slice(1) }; continue; }
        if (n.src.length || n.gndRef) fail('warn', `${name(it)}: ${p.n} is wired to ${n.gndRef ? 'GND' : fmtV(n.v)} instead of a GPIO.`);
        else if (anyConn) push('info', it.uid, `${name(it)}: ${p.n} is not connected yet.`);
        C.ok = false; continue;
      }
      if (n.gpio.length > 1 && new Set(n.gpio.map((g) => g.uid)).size > 1) fail('error', `${name(it)}: ${p.n} joins pins of two different boards.`);
      const b = board.it, bd = board.def, caps = board.p.caps || [], L = /^\d+$/.test(label(board.n)) ? `GPIO${label(board.n)}` : label(board.n);
      if (main && b.uid !== main.uid) { push('info', it.uid, `${name(it)} is wired to ${name(b)}, not the main board — no code is generated for it.`); }
      else usesMain = true;
      C.pins[p.n] = board;
      if (board.p.role === 'flash') { fail('error', `${L} on ${bd.name} is used by the on-module SPI flash — do not connect anything to it.`); continue; }
      // capability
      const fam = bd.family;
      if (t === 'ao') {
        if (bd.noAdc) fail('error', `${bd.name} has no analog inputs — ${name(it)} ${p.n} needs an ADC. Add an ADS1115.`);
        else if (!caps.includes('adc')) fail('error', `${name(it)}: ${p.n} is analog but ${L} is not an analog pin.`);
        else if (caps.includes('adc2')) push('warn', it.uid, `${L} is on ESP32 ADC2, which stops working while Wi-Fi is on. Prefer GPIO 32–39.`);
      }
      if (t === 'pwm' && !caps.includes('pwm')) fail(fam === 'arduino-avr' ? 'error' : 'warn', `${name(it)}: ${p.n} needs PWM but ${L} is not PWM-capable.`);
      if (t === 'servo' && fam === 'rpi' && !caps.includes('pwm')) push('warn', it.uid, `Servos on ${L} use software PWM and jitter — prefer GPIO12, 13, 18 or 19.`);
      if (t === 'sda' || t === 'scl') {
        if (!caps.includes(t)) fail(fam === 'esp32' || fam === 'esp8266' ? 'warn' : 'error', `${name(it)}: ${t.toUpperCase()} must go to an I²C ${t.toUpperCase()} pin; ${L} is not one${fam === 'esp32' ? ' by default (Wire.begin(sda, scl) can remap it)' : ''}.`);
      }
      if (['mosi', 'miso', 'sck'].includes(t) && !caps.includes(t)) fail(fam === 'arduino-avr' || fam === 'rpi' ? 'error' : 'warn', `${name(it)}: ${p.n} should go to the hardware SPI ${t.toUpperCase()} pin, not ${L}.`);
      if (t === 'tx' && caps.includes('tx')) fail('error', `${name(it)}: TX must go to the board's RX, not TX (${L}).`);
      if (t === 'rx' && caps.includes('rx')) fail('error', `${name(it)}: RX must go to the board's TX, not RX (${L}).`);
      if ((t === 'tx' || t === 'rx') && fam === 'rpi' && !caps.includes(t === 'tx' ? 'rx' : 'tx')) fail('error', `On a Raspberry Pi the UART is GPIO14 (TX) / GPIO15 (RX).`);
      if ((t === 'tx' || t === 'rx') && fam === 'arduino-avr' && (L === 'D0' || L === 'D1')) push('warn', it.uid, `${L} is shared with the USB serial port — uploads fail while ${name(it)} is connected. Use SoftwareSerial on other pins.`);
      if (INCOMING.has(t) && caps.includes('inputOnly')) fail('error', `GPIO${board.p.code} is input-only on the ESP32 — it cannot drive ${name(it)} ${p.n}.`);
      if (caps.includes('strap')) push('warn', it.uid, `${L} is a boot strapping pin on ${bd.name}; ${name(it)} may stop the board from booting.`);
      if (caps.includes('reserved')) push('warn', it.uid, `${L} is reserved for the HAT ID EEPROM.`);
      // voltage levels
      const outV = def.outV === 'vcc' || def.outV === undefined ? C.v : def.outV;
      if (OUTGOING.has(t) && outV && outV > bd.logic + 0.4) fail('error', `${name(it)} ${p.n} outputs ${fmtV(outV)} into ${L} of ${bd.name}, a ${bd.logic} V pin.`, { fix: 'Add a level shifter or a 1 kΩ/2 kΩ divider.' });
      if (INCOMING.has(t) && def.inMax && bd.logic > def.inMax) fail('error', `${name(it)} ${p.n} takes ${def.inMax} V max, but ${bd.name} drives ${bd.logic} V.`, { fix: 'Use a level shifter.' });
      if (INCOMING.has(t) && def.vih && bd.logic < def.vih && C.v > bd.logic) push('warn', it.uid, `${name(it)} on ${fmtV(C.v)} may not see a ${bd.logic} V HIGH reliably.`);
      if (gNet && main && b.uid === main.uid && mainGnd && gNet !== mainGnd) fail('error', `${name(it)} and ${bd.name} do not share a ground — connect the GNDs together.`);
      // pin shared with another part
      const others = n.parts.filter((x) => x.uid !== it.uid && isSignal(x.p.t) && !(BUS.has(x.p.t) && BUS.has(t)));
      if (others.length && !BUS.has(t)) push('warn', it.uid, `${L} is shared by ${name(it)} and ${name(others[0].it)}.`);
    }
    // required signals missing
    const sigs = def.pins.filter((p) => isSignal(p.t));
    if (sigs.length && sigs.every((p) => !C.pins[p.n])) C.ok = false;
    if (def.drv === 'hcsr04' && !(C.pins.TRIG && C.pins.ECHO)) C.ok = false;

    // two-terminal parts
    if (def.id === 'led' || def.id === 'rgbled') ledChecks(A, it, def, C, push, fail);
    if (def.id === 'button') buttonChecks(A, it, def, C, push);
    if (def.id === 'motor') {
      for (const p of def.pins) if (net(p.n).gpio.length) fail('error', `A DC motor on a GPIO pin will draw far more than the ~20 mA a pin can give and can destroy it. Use an L298N or a transistor.`);
      const a = net('+'), b = net('-');
      C.ok = !!(a.v && b.gndRef) || !!(b.v && a.gndRef);
    }
    if (def.drv === 'ads1115') C.adc = true;
    C.main = usesMain || Object.values(C.pins).some((b) => b?.p && main && b.uid === main.uid);
  }

  // I²C address conflicts
  const byBus = new Map();
  for (const it of A.doc.items) {
    const def = defOf(it); if (!def?.i2c) continue;
    const sda = def.pins.find((p) => p.t === 'sda'); if (!sda) continue;
    const bus = A.netOf.get(`${it.uid}:${sda.n}`);
    if (A.info.get(bus).connected < 2) continue;
    const k = `${bus}|${def.i2c}`;
    if (byBus.has(k)) { const o = byBus.get(k); push('error', it.uid, `I²C address clash: ${name(it)} and ${name(o)} are both 0x${def.i2c.toString(16).toUpperCase()} on the same bus.`, { fix: 'Change one address (ADDR/AD0 pin) or use a TCA9548A multiplexer.' }); A.conn.get(it.uid).ok = false; }
    else byBus.set(k, it);
  }
  // Pico: SDA/SCL must be on the same I²C controller
  if (main && BOARDS[main.type].family === 'pico') {
    for (const C of A.conn.values()) {
      const s = C.pins.SDA || C.pins.SDI, c = C.pins.SCL;
      if (s?.p && c?.p) { const bs = picoI2C(+s.p.code), bc = picoI2C(+c.p.code); if (bs !== bc) { push('error', C.uid, `GP${s.p.code} (SDA) and GP${c.p.code} (SCL) belong to different Pico I²C controllers.`); C.ok = false; } }
    }
  }

  // supply budget
  const loads = new Map();
  for (const it of A.doc.items) {
    const def = defOf(it); if (def?.kind !== 'part' || !def.ma || def.psu || def.battery) continue;
    const C = A.conn.get(it.uid); if (!C) continue;
    let n;
    if (def.id === 'led' || def.id === 'rgbled') continue;
    const vp = def.pins.find((p) => p.t === 'vcc'); if (!vp) continue;
    n = A.net(`${it.uid}:${vp.n}`); if (!n?.src.length) continue;
    const s = n.src[0]; const k = s.kind === 'board' ? `${s.pin.uid}|${s.pin.p.role}` : `${s.pin.uid}|${s.pin.n}`;
    if (!loads.has(k)) loads.set(k, { s, ma: 0, parts: [] });
    const L = loads.get(k); L.ma += def.ma; L.parts.push(it);
  }
  A.loads = [];
  for (const L of loads.values()) {
    const s = L.s; let max = 0, what;
    if (s.kind === 'board') { max = POWER[s.pin.it.type]?.[s.pin.p.role] || 500; what = `${label(s.pin.n)} pin of ${defOf(s.pin.it).name}`; }
    else { max = defOf(s.pin.it).ma || 700; what = defOf(s.pin.it).name; }
    A.loads.push({ what, ma: L.ma, max, v: s.v });
    if (L.ma > max) push('error', s.pin.uid, `${what} supplies ~${max} mA but the parts on it draw ~${Math.round(L.ma)} mA.`, { fix: 'Use an external supply (MB102 or a 5–6 V pack) with a common GND.' });
    else if (L.ma > max * 0.75) push('warn', s.pin.uid, `${what} is near its limit: ~${Math.round(L.ma)} of ${max} mA.`);
    const servos = L.parts.filter((p) => ['servo', 'stepper', 'l298n'].includes(p.type));
    if (servos.length && s.kind === 'board' && s.pin.p.role === 'p5') push('warn', servos[0].uid, `${servos.length > 1 ? 'Motors draw' : `${defOf(servos[0]).name} draws`} current spikes from the board's 5 V — brown-outs can reset it. Prefer a separate supply.`);
  }
  // multiple grounds
  if (gndNets.length > 1) {
    const roots = gndNets.map((n) => n.keys.map((k) => A.pins.get(k)).find((p) => p.kind === 'board' || p.def.psu || p.def.battery));
    const names = [...new Set(roots.filter(Boolean).map((p) => defOf(p.it).name))];
    if (names.length > 1) push('warn', roots[1]?.uid, `Separate grounds: ${names.join(', ')}. Signals between them need a common GND.`);
  }
  // board-level notes
  if (!main) push('info', null, 'Add a board (Arduino, ESP32, Raspberry Pi…) to start.');
  const order = { error: 0, warn: 1, info: 2 };
  I.sort((a, b) => order[a.sev] - order[b.sev]);
  // de-duplicate
  const seen = new Set();
  A.issues = I.filter((x) => { const k = x.sev + x.uid + x.msg; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const picoI2C = (g) => ([0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21].includes(g) ? 0 : 1);
function srcName(s) { return s.kind === 'board' ? `${label(s.pin.n)} of ${defOf(s.pin.it).name}` : defOf(s.pin.it).name; }

/** Follow a net through a resistor: returns {gpio, ohms} | {supply} | {gnd}. */
function traceDrive(A, key) {
  const n = A.net(key);
  if (n.gpio.length) return { gpio: n.gpio[0], ohms: 0, net: n };
  if (n.src.length) return { supply: n.v, ohms: 0, net: n };
  if (n.gndRef) return { gnd: true };
  for (const k of n.keys) {
    const pin = A.pins.get(k);
    if (pin.kind !== 'part' || pin.def.passive !== 'resistor') continue;
    const other = A.net(`${pin.uid}:${pin.n === '1' ? '2' : '1'}`);
    const ohms = OHMS[(pin.it.props || {}).ohms || '220'];
    if (other.id === n.id) continue;
    if (other.gpio.length) return { gpio: other.gpio[0], ohms, net: other };
    if (other.src.length) return { supply: other.v, ohms, net: other };
    if (other.gndRef) return { gnd: true, ohms };
  }
  return {};
}
export { traceDrive };

function ledChecks(A, it, def, C, push, fail) {
  const anodes = def.pins.filter((p) => p.t === 'a'), k = def.pins.find((p) => p.t === 'k');
  const kd = traceDrive(A, `${it.uid}:${k.n}`);
  const color = (it.props || {}).color || 'Red';
  const vf = def.id === 'rgbled' ? { R: 2, G: 3, B: 3 } : { Red: 2, Orange: 2.1, Yellow: 2.1, Green: 3, Blue: 3, White: 3 };
  C.ok = false;
  for (const a of anodes) {
    const ad = traceDrive(A, `${it.uid}:${a.n}`);
    const nm = `${def.name}${anodes.length > 1 ? ` ${a.n}` : ''}`;
    if (ad.gnd && (kd.gpio || kd.supply)) { push('warn', it.uid, `${nm} is reversed — the long leg (anode) goes to the + side.`); continue; }
    if (!(ad.gpio || ad.supply) || !kd.gnd) continue;
    const V = ad.gpio ? ad.gpio.def.logic : ad.supply, f = vf[def.id === 'rgbled' ? a.n : color] ?? 2;
    if (!ad.ohms && !kd.ohms) { fail('error', `${nm} has no current-limiting resistor — it will burn out${ad.gpio ? ' and can damage the pin' : ''}.`, { fix: `Add ${V > 4 ? '220' : '100'} Ω in series.` }); continue; }
    const ohms = ad.ohms || kd.ohms, mA = ((V - f) / ohms) * 1000;
    if (mA > 20) push('warn', it.uid, `${nm}: ~${mA.toFixed(0)} mA through ${ohms} Ω — above the 20 mA LED rating.`);
    else if (mA < 0.5) push('warn', it.uid, `${nm}: only ~${Math.max(0, mA).toFixed(1)} mA — it will be very dim${V - f < 0.3 ? ` (${V} V barely exceeds its ${f} V forward voltage)` : ''}.`);
    C.ok = true;
    C.pins[a.n] = ad.gpio || { supply: ad.supply };
    C.mA = mA;
  }
}
function buttonChecks(A, it, def, C, push) {
  const a = A.net(`${it.uid}:1`), b = A.net(`${it.uid}:2`);
  if (a.id === b.id && a.connected > 1) { push('warn', it.uid, `Both legs of the button are on the same breadboard column, so it is always "pressed". Rotate it or move it across the centre gap.`); C.ok = false; return; }
  const g = a.gpio[0] ? [a, b] : b.gpio[0] ? [b, a] : null;
  C.ok = false;
  if (!g) return;
  const [sig, other] = g;
  C.pins.SIG = sig.gpio[0];
  if (other.gndRef) { C.mode = 'pullup'; C.ok = true; }
  else if (other.src.length) {
    C.mode = 'pulldown'; C.ok = true;
    const pd = sig.keys.some((k) => { const p = A.pins.get(k); return p.def?.passive === 'resistor' && A.net(`${p.uid}:${p.n === '1' ? '2' : '1'}`).gndRef; });
    if (!pd && sig.gpio[0].def.family === 'arduino-avr') push('warn', it.uid, `Button to ${fmtV(other.v)} needs a 10 kΩ pull-down on the GPIO, or wire the other leg to GND and use INPUT_PULLUP.`);
    if (other.v > sig.gpio[0].def.logic + 0.4) { push('error', it.uid, `Button feeds ${fmtV(other.v)} into a ${sig.gpio[0].def.logic} V GPIO.`); C.ok = false; }
  }
}

// ── Auto-wiring ────────────────────────────────────────────────────────────
/** Pick board pins for every pin of a module and return wires to add. */
export function autoWire(A, partUid, boardUid) {
  const it = A.items.get(partUid), def = defOf(it), b = A.items.get(boardUid), bd = defOf(b);
  if (!def || !bd || def.kind !== 'part') return { wires: [], notes: ['Select a module first.'] };
  const notes = [], wires = [];
  const used = new Set();
  for (const p of bd.pins) { const n = A.net(`${b.uid}:${p.n}`); if (n.connected > 1 || n.parts.length) used.add(p.n); }
  const free = (filter, prefer = () => 0) => bd.pins.filter((p) => p.role === 'gpio' && !used.has(p.n) && filter(p)).sort((x, y) => prefer(y) - prefer(x))[0];
  const busy = bd.family === 'pico' ? ['tx', 'rx', 'adc'] : ['tx', 'rx', 'reserved', 'strap', 'sda', 'scl', 'mosi', 'miso', 'sck', 'cs', 'adc2'];
  const plain = (p) => !(p.caps || []).some((c) => busy.includes(c)) ? 1 : 0;
  const PREF = { pico: { sda: '4', scl: '5', mosi: '19', miso: '16', sck: '18' }, esp32: { sda: '21', scl: '22', mosi: '23', miso: '19', sck: '18' } };
  const firstWith = (cap) => (PREF[bd.family]?.[cap] && bd.pins.find((p) => p.code === PREF[bd.family][cap])) || bd.pins.find((p) => p.role === 'gpio' && (p.caps || []).includes(cap) && (bd.id !== 'uno' && bd.id !== 'mega' || !/^A\d|^D2\d/.test(label(p.n))) ) || bd.pins.find((p) => (p.caps || []).includes(cap));
  const pinByRole = (role) => { const ps = bd.pins.filter((p) => p.role === role); return ps.find((p) => !used.has(p.n)) || ps[0]; };
  const mark = (p) => { if (p) used.add(p.n); return p; };
  const fam = bd.family;
  // supply choice
  const can33 = (def.vmin ?? 0) <= 3.3 && (def.vmax ?? 99) >= 3.3, can5 = (def.vmin ?? 0) <= 5 && (def.vmax ?? 99) >= 5;
  const vccRole = bd.logic < 4 ? (can33 ? 'p33' : can5 ? 'p5' : null) : (can5 ? 'p5' : can33 ? 'p33' : null);
  for (const p of def.pins) {
    let bp = null; const t = p.t;
    if (t === 'vcc' || t === 'lvref') { bp = vccRole ? pinByRole(t === 'lvref' ? 'p33' : vccRole) : null; if (!bp) notes.push(`${def.name} needs ${def.vmin}–${def.vmax} V, which this board does not provide.`); }
    else if (t === 'hvref') bp = pinByRole('p5');
    else if (t === 'gnd') bp = pinByRole('gnd');
    else if (t === 'sda' || t === 'scl') bp = firstWith(t);
    else if (['mosi', 'miso', 'sck'].includes(t)) bp = firstWith(t);
    else if (t === 'ao') {
      if (bd.noAdc) { notes.push(`${bd.name} has no ADC — wire ${p.n} to an ADS1115 input.`); continue; }
      bp = mark(free((q) => q.caps.includes('adc') && !q.caps.includes('sda') && !q.caps.includes('scl'), (q) => (q.caps.includes('adc2') ? 0 : 2) + (q.caps.includes('inputOnly') ? 1 : 0)) || free((q) => q.caps.includes('adc')));
    } else if (t === 'pwm') bp = mark(free((q) => q.caps.includes('pwm') && !q.caps.includes('inputOnly'), plain));
    else if (t === 'tx' || t === 'rx') {
      const want = t === 'tx' ? 'rx' : 'tx';
      if (fam === 'rpi') bp = mark(bd.pins.find((q) => q.caps?.includes(want)));
      else if (fam === 'esp32') bp = mark(bd.pins.find((q) => q.code === (t === 'tx' ? '16' : '17')));
      else if (fam === 'pico') bp = mark(bd.pins.find((q) => q.code === (t === 'tx' ? '5' : '4')));
      else bp = mark(free((q) => !q.caps.includes('adc') || fam !== 'arduino-avr', plain) || free(() => true));
    } else if (['do', 'dio'].includes(t)) bp = mark(free((q) => !q.caps.includes('adcOnly') && !q.caps.includes('inputOnly'), (q) => plain(q) * 2 + (q.caps.includes('adc') ? 0 : 1)) || free((q) => !q.caps.includes('adcOnly')));
    else if (['di', 'servo', 'tone', 'cs'].includes(t)) bp = mark(free((q) => !q.caps.includes('inputOnly') && !q.caps.includes('adcOnly'), (q) => plain(q) * 2 + (q.caps.includes('adc') ? 0 : 1) + (t === 'servo' && q.caps.includes('pwm') ? 2 : 0)));
    else if (t === 'sw') { if (p.n === '1') bp = mark(free((q) => !q.caps.includes('inputOnly') || true, (q) => plain(q) * 2 + (q.caps.includes('adc') ? 0 : 1))); else bp = pinByRole('gnd'); }
    else continue;
    if (!bp) { if (!['vcc', 'lvref', 'hvref'].includes(t)) notes.push(`No free pin for ${p.n}.`); continue; }
    const existing = A.net(`${it.uid}:${p.n}`);
    if (existing.keys.includes(`${b.uid}:${bp.n}`)) continue;
    wires.push({ a: `${b.uid}:${bp.n}`, b: `${it.uid}:${p.n}`, t });
  }
  if (def.id === 'led' || def.id === 'rgbled') return { wires: [], notes: ['LEDs need a series resistor: put the LED and a resistor on the breadboard and wire them by hand.'] };
  return { wires, notes };
}

export function wireColor(A, a, b, t) {
  const kinds = [a, b].map((k) => { const p = A.pins.get(k); if (!p) return ''; if (p.kind === 'board') return p.p.role; return p.p.t; });
  if (kinds.some((k) => ['p5', 'p33', 'vcc', 'src', 'vin', 'lvref', 'hvref'].includes(k)) || t === 'vcc') return '#e0262b';
  if (kinds.some((k) => k === 'gnd') || t === 'gnd') return '#222226';
  const c = { sda: '#2a8bff', scl: '#ffd23f', mosi: '#2fbf4a', miso: '#a77bff', sck: '#ffd23f', cs: '#ff8a1f', tx: '#2fbf4a', rx: '#ffffff', ao: '#ff8a1f', pwm: '#a77bff', servo: '#ff8a1f' };
  return c[t] || c[kinds[1]] || c[kinds[0]] || ['#2fbf4a', '#2a8bff', '#ffd23f', '#ff8a1f', '#a77bff', '#ffffff'][Math.floor(Math.random() * 6)];
}
export { LED_COL };
