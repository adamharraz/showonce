/** Ready-made example projects, built with the same helpers the editor uses. */
import { analyze, autoWire, wireColor, rotXY, defOf } from './circuit.js';
import { layout } from './breadboard.js';

function builder(title) {
  const doc = { v: 1, title, items: [], wires: [], rules: [], main: null, lang: null };
  let n = 0;
  const api = {
    doc,
    add(type, x, y, rot = 0, props = {}) { const uid = `${type.replace(/[^a-z0-9]/g, '')}_${++n}`; doc.items.push({ uid, type, x, y, rot, props }); return uid; },
    wire(a, b, color) { doc.wires.push({ uid: `w_${++n}`, a, b, color: color || wireColor(analyze(doc), a, b) }); },
    hole(bb, h) { return `${bb}:${h}`; },
    /** Place an item so that one of its pins sits in a breadboard hole. */
    plug(uid, bb, hole, pin) {
      const it = doc.items.find((x) => x.uid === uid), b = doc.items.find((x) => x.uid === bb);
      const p = pin ? defOf(it).pins.find((q) => q.n === pin) : defOf(it).pins[0];
      const h = layout(defOf(b).breadboard).holes.find((q) => q.n === hole);
      const [hx, hy] = rotXY(b, h.x, h.y), [ox, oy] = rotXY({ x: 0, y: 0, rot: it.rot }, p.x, p.y);
      it.x = hx - ox; it.y = hy - oy;
    },
    auto(uid, board) { const A = analyze(doc); const r = autoWire(A, uid, board); for (const w of r.wires) doc.wires.push({ uid: `w_${++n}`, a: w.a, b: w.b, color: wireColor(A, w.a, w.b, w.t) }); },
    rule(src, op, val, dst, act = 'on', arg) { doc.rules.push({ uid: `r_${++n}`, src, op, val, dst, act, arg }); },
  };
  return api;
}

export const EXAMPLES = {
  parking: ['Parking sensor — Arduino Nano', () => {
    const E = builder('Parking sensor'); const bb = E.add('bb830', 0, 0);
    const nano = E.add('nano', 0, 0); E.plug(nano, bb, 'g5', 'D1'); E.doc.main = nano;
    E.wire(E.hole(bb, 'a8'), E.hole(bb, 'B+5')); E.wire(E.hole(bb, 'a6'), E.hole(bb, 'B-4')); E.wire(E.hole(bb, 'j8'), E.hole(bb, 'T-5'));
    const hc = E.add('hcsr04', 0, 0, 2); E.plug(hc, bb, 'a33', 'VCC');
    E.wire(E.hole(bb, 'b33'), E.hole(bb, 'B+26')); E.wire(E.hole(bb, 'b30'), E.hole(bb, 'B-24'));
    E.wire(E.hole(bb, 'c32'), E.hole(bb, 'h16'), '#ffd23f'); E.wire(E.hole(bb, 'c31'), E.hole(bb, 'h17'), '#2fbf4a');
    const bz = E.add('buzzer', 0, 0, 2); E.plug(bz, bb, 'a47', 'I/O');
    E.wire(E.hole(bb, 'b47'), E.hole(bb, 'h13'), '#a77bff'); E.wire(E.hole(bb, 'b46'), E.hole(bb, 'B+37')); E.wire(E.hole(bb, 'b45'), E.hole(bb, 'B-36'));
    const r1 = E.add('resistor', 0, 0, 0, { ohms: '220' }); E.plug(r1, bb, 'h36', '1');
    const red = E.add('led', 0, 0, 0, { color: 'Red' }); E.plug(red, bb, 'f40', 'A');
    E.wire(E.hole(bb, 'i11'), E.hole(bb, 'i36'), '#ff8a1f'); E.wire(E.hole(bb, 'j41'), E.hole(bb, 'T-33'));
    const r2 = E.add('resistor', 0, 0, 0, { ohms: '220' }); E.plug(r2, bb, 'h46', '1');
    const green = E.add('led', 0, 0, 0, { color: 'Green' }); E.plug(green, bb, 'f50', 'A');
    E.wire(E.hole(bb, 'i12'), E.hole(bb, 'i46'), '#2a8bff'); E.wire(E.hole(bb, 'j51'), E.hole(bb, 'T-41'));
    E.rule(`${hc}.dist`, '<', 20, bz, 'on'); E.rule(`${hc}.dist`, '<', 40, red, 'on'); E.rule(`${hc}.dist`, '>', 40, green, 'on');
    return E.doc;
  }],
  blink: ['Blink & button — Arduino Uno', () => {
    const E = builder('Blink & button'); const uno = E.add('uno', -78, 0); E.doc.main = uno; const bb = E.add('bb400', 22, 0);
    const res = E.add('resistor', 0, 0, 0, { ohms: '220' }); E.plug(res, bb, 'c6', '1');
    const led = E.add('led', 0, 0, 0, { color: 'Red' }); E.plug(led, bb, 'e10', 'A');
    const btn = E.add('button', 0, 0, 0, { cap: '#2a6fd6' }); E.plug(btn, bb, 'f20', '1');
    E.wire(`${uno}:D13`, E.hole(bb, 'a6'), '#ff8a1f'); E.wire(E.hole(bb, 'a11'), E.hole(bb, 'B-9')); E.wire(`${uno}:GND.2`, E.hole(bb, 'B-1'));
    E.wire(`${uno}:D2`, E.hole(bb, 'j20'), '#2a8bff'); E.wire(E.hole(bb, 'j23'), E.hole(bb, 'T-19')); E.wire(`${uno}:GND.1`, E.hole(bb, 'T-1'));
    E.rule(`${btn}.press`, 'is', 1, led, 'on');
    return E.doc;
  }],
  weather: ['Weather station — Uno + BME280 + OLED + LCD', () => {
    const E = builder('Weather station'); const uno = E.add('uno', 0, 0); E.doc.main = uno;
    const bme = E.add('bme280', 72, -30); const oled = E.add('oled', 78, 20); const lcd = E.add('lcd1602', 0, 82); const rtc = E.add('ds3231', -72, -40);
    for (const m of [bme, oled, lcd, rtc]) E.auto(m, uno);
    return E.doc;
  }],
  plant: ['Smart plant — ESP32 + soil + DHT22 + relay', () => {
    const E = builder('Smart plant'); const esp = E.add('esp32', 0, 0); E.doc.main = esp;
    const soil = E.add('soil', -66, 20); const dht = E.add('dht22', 66, -32); const relay = E.add('relay', 70, 32); const oled = E.add('oled', -30, -52);
    for (const m of [soil, dht, relay, oled]) E.auto(m, esp);
    E.rule(`${soil}.moist`, '<', 30, relay, 'on');
    E.doc.lang = 'arduino';
    return E.doc;
  }],
  pilight: ['Motion light — Raspberry Pi 5 + PIR + ADS1115', () => {
    const E = builder('Motion light'); const pi = E.add('pi5', -64, 0); E.doc.main = pi; const bb = E.add('bb400', 46, 18);
    const res = E.add('resistor', 0, 0, 0, { ohms: '220' }); E.plug(res, bb, 'c6', '1');
    const led = E.add('led', 0, 0, 0, { color: 'White' }); E.plug(led, bb, 'e10', 'A');
    E.wire(`${pi}:GPIO17`, E.hole(bb, 'a6'), '#ff8a1f'); E.wire(E.hole(bb, 'a11'), E.hole(bb, 'B-9')); E.wire(`${pi}:GND.1`, E.hole(bb, 'B-1'));
    const pir = E.add('pir', 40, -50); E.auto(pir, pi);
    const ads = E.add('ads1115', -40, -56); E.auto(ads, pi);
    const ldr = E.add('ldr', -90, -56); E.auto(ldr, pi); E.wire(`${ldr}:AO`, `${ads}:A0`, '#ff8a1f');
    E.rule(`${pir}.motion`, 'is', 1, led, 'on');
    return E.doc;
  }],
  pico: ['NeoPixel thermometer — Raspberry Pi Pico', () => {
    const E = builder('NeoPixel thermometer'); const bb = E.add('bb830', 0, 0); const pico = E.add('pico', 0, 0); E.plug(pico, bb, 'b10', 'GP0'); E.doc.main = pico;
    const dht = E.add('dht22', -40, -55); const px = E.add('neopixel', 30, -62); const oled = E.add('oled', 70, -55);
    for (const m of [dht, px, oled]) E.auto(m, pico);
    E.rule(`${dht}.temp`, '>', 22, px, 'color', '#ff7a1a');
    return E.doc;
  }],
  faults: ['Fault-finding challenge — ESP32', () => {
    const E = builder('Fault-finding challenge'); const esp = E.add('esp32', 0, 0); E.doc.main = esp;
    const hc = E.add('hcsr04', -70, -30); E.auto(hc, esp);
    const mpu = E.add('mpu6050', 70, -30); E.auto(mpu, esp); const rtc = E.add('ds3231', 75, 25); E.auto(rtc, esp);
    const rfid = E.add('rc522', -78, 45); E.auto(rfid, esp);
    const v = E.doc.wires.find((w) => w.b === `${rfid}:3.3V`); if (v) v.a = `${esp}:5V`;
    const led = E.add('led', 0, 45, 0, { color: 'Yellow' }); E.wire(`${esp}:13`, `${led}:A`, '#ffd23f'); E.wire(`${led}:K`, `${esp}:GND.3`);
    return E.doc;
  }],
};
