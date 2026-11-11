import { describe, expect, it } from 'vitest';
import { analyze, autoWire } from '../vendor/proto-lab/src/circuit.js';
import { generate } from '../vendor/proto-lab/src/codegen.js';
import { Sim } from '../vendor/proto-lab/src/sim.js';
import { EXAMPLES } from '../vendor/proto-lab/src/examples.js';

const item = (uid, type, x = 0) => ({ uid, type, x, y: 300, rot: 0, props: {} });
const wire = (a, b) => ({ uid: `${a}-${b}`, a, b });
function shiftedSensor() {
  return {
    v: 1, main: 'esp', items: [item('esp', 'esp32'), item('hc', 'hcsr04', 100), item('sh', 'levelshift', 200)], rules: [],
    wires: [
      wire('esp:5V', 'hc:VCC'), wire('esp:5V', 'sh:HV'), wire('esp:3V3', 'sh:LV'),
      wire('esp:GND.1', 'hc:GND'), wire('esp:GND.1', 'sh:GND'), wire('esp:17', 'hc:TRIG'),
      wire('hc:ECHO', 'sh:HV1'), wire('sh:LV1', 'esp:16'),
    ],
  };
}

describe('Auto-wire preserves existing circuit paths', () => {
  it('does not add a second GPIO to the plant example DHT22', () => {
    const doc = EXAMPLES.plant[1]();
    const dht = doc.items.find(x => x.type === 'dht22');
    const before = analyze(doc);
    const gpio = before.conn.get(dht.uid).pins.DATA.n;
    expect(autoWire(before, dht.uid, doc.main).wires).toEqual([]);
    expect(before.net(`${dht.uid}:DATA`).gpio.map(p => p.n)).toEqual([gpio]);
  });

  it('preserves a GPIO reached through a breadboard column', () => {
    const doc = { main: 'esp', items: [item('esp', 'esp32'), item('dht', 'dht22', 100), item('bb', 'bb400', 200)], rules: [],
      wires: [wire('esp:3V3', 'dht:VCC'), wire('esp:GND.1', 'dht:GND'), wire('dht:DATA', 'bb:a6'), wire('bb:e6', 'esp:17')] };
    expect(analyze(doc).conn.get('dht').pins.DATA.n).toBe('17');
    expect(autoWire(analyze(doc), 'dht', 'esp').wires).toEqual([]);
  });

  it('preserves both complete shifted paths and incomplete manual signal wiring', () => {
    const doc = shiftedSensor();
    expect(autoWire(analyze(doc), 'hc', 'esp').wires).toEqual([]);
    doc.wires = doc.wires.filter(w => w.a !== 'sh:LV1');
    expect(autoWire(analyze(doc), 'hc', 'esp').wires).toEqual([]);
  });

  it('keeps an existing manual supply instead of adding another rail', () => {
    const doc = EXAMPLES.plant[1]();
    const dht = doc.items.find(x => x.type === 'dht22');
    doc.wires.find(w => w.b === `${dht.uid}:VCC`).a = `${doc.main}:5V`;
    expect(autoWire(analyze(doc), dht.uid, doc.main).wires).toEqual([]);
  });
});

describe('Powered level shifter signal traversal', () => {
  it('maps ECHO through a matching channel, simulates readings, and exports pin 16', () => {
    const A = analyze(shiftedSensor());
    expect(A.conn.get('hc').ok).toBe(true);
    expect(A.conn.get('hc').pins.ECHO.n).toBe('16');
    expect(A.issues.filter(x => x.sev === 'error')).toEqual([]);
    expect(A.net('sh:HV').v).toBe(5);
    expect(A.net('sh:LV').v).toBe(3.3);
    expect(A.netOf.get('sh:HV1')).not.toBe(A.netOf.get('sh:LV1'));
    const sim = new Sim(); sim.set('hc', 'dist', 42);
    expect(sim.tick(A, 0.2).readings).toEqual([expect.objectContaining({ uid: 'hc', k: 'dist', val: 42 })]);
    expect(generate(A, 'arduino').code).toContain('pulseIn(16, HIGH, 30000) / 58.0');
    expect(generate(A, 'micropython').code).toContain('hcsr04_1_echo = Pin(16, Pin.IN)');
  });

  it('is independent of whether the shifter occurs before the sensor in the document', () => {
    const doc = shiftedSensor(); doc.items.reverse();
    expect(analyze(doc).conn.get('hc').pins.ECHO?.n).toBe('16');
  });

  it.each(['unpowered LV', 'unpowered HV', 'missing ground', 'reversed references', 'reversed signal sides', 'mismatched channel', 'shorted references'])(
    'does not report a working sensor with %s', fault => {
      const doc = shiftedSensor();
      if (fault === 'unpowered LV') doc.wires = doc.wires.filter(w => w.b !== 'sh:LV');
      if (fault === 'unpowered HV') doc.wires = doc.wires.filter(w => w.b !== 'sh:HV');
      if (fault === 'missing ground') doc.wires = doc.wires.filter(w => w.b !== 'sh:GND');
      if (fault === 'reversed references') { doc.wires.find(w => w.b === 'sh:LV').a = 'esp:5V'; doc.wires.find(w => w.b === 'sh:HV').a = 'esp:3V3'; }
      if (fault === 'reversed signal sides') { doc.wires.find(w => w.a === 'hc:ECHO').b = 'sh:LV1'; doc.wires.find(w => w.a === 'sh:LV1').a = 'sh:HV1'; }
      if (fault === 'mismatched channel') doc.wires.find(w => w.a === 'sh:LV1').a = 'sh:LV2';
      if (fault === 'shorted references') doc.wires.push(wire('sh:HV', 'sh:LV'));
      const A = analyze(doc);
      expect(A.conn.get('hc').ok).toBe(false);
      expect(new Sim().tick(A, 0.2).readings).toEqual([]);
    },
  );

  it('still rejects direct 5 V ECHO even with a powered shifter elsewhere', () => {
    const doc = shiftedSensor(); doc.wires.push(wire('hc:ECHO', 'esp:16'));
    const A = analyze(doc);
    expect(A.conn.get('hc').ok).toBe(false);
    expect(A.issues.some(x => x.sev === 'error' && x.msg.includes('outputs 5 V'))).toBe(true);
  });

  it('checks board-to-module voltage after translation as well', () => {
    const doc = shiftedSensor();
    doc.wires = doc.wires.filter(w => w.b !== 'hc:TRIG');
    doc.wires.push(wire('esp:17', 'sh:LV2'), wire('sh:HV2', 'hc:TRIG'));
    const A = analyze(doc);
    expect(A.conn.get('hc').ok).toBe(true);
    expect(A.conn.get('hc').pins.TRIG.n).toBe('17');
  });

  it('rejects a reversed board-driven channel whose HV pull-up reaches the GPIO', () => {
    const doc = shiftedSensor();
    doc.wires = doc.wires.filter(w => w.b !== 'hc:TRIG');
    doc.wires.push(wire('esp:17', 'sh:HV2'), wire('sh:LV2', 'hc:TRIG'));
    const A = analyze(doc);
    expect(A.conn.get('hc').ok).toBe(false);
    expect(new Sim().tick(A, 0.2).readings).toEqual([]);
  });

  it('does not mistake the digital shifter for an analog voltage divider', () => {
    const doc = shiftedSensor();
    doc.items.push(item('soil', 'soil', 400));
    doc.wires.push(wire('esp:5V', 'soil:VCC'), wire('esp:GND.1', 'soil:GND'), wire('soil:AOUT', 'sh:HV2'), wire('sh:LV2', 'esp:32'));
    expect(analyze(doc).conn.get('soil').ok).toBe(false);
  });

  it('rejects a high-side pull-up above a module output voltage', () => {
    const doc = shiftedSensor();
    doc.items.push(item('dht', 'dht22', 400));
    doc.wires.push(wire('esp:3V3', 'dht:VCC'), wire('esp:GND.1', 'dht:GND'), wire('dht:DATA', 'sh:HV2'), wire('sh:LV2', 'esp:32'));
    expect(analyze(doc).conn.get('dht').ok).toBe(false);
  });
});

function buttonLed(boardType) {
  const gpio = boardType === 'uno' ? ['D2', 'D13'] : boardType === 'pi5' ? ['GPIO17', 'GPIO18'] : ['17', '16'];
  const gnd = 'GND.1';
  return { main: 'board', items: [item('board', boardType), item('btn', 'button', 100), item('led', 'led', 200), item('r', 'resistor', 300)],
    wires: [wire(`board:${gpio[0]}`, 'btn:1'), wire(`board:${gnd}`, 'btn:2'), wire(`board:${gpio[1]}`, 'r:1'), wire('r:2', 'led:A'), wire(`board:${gnd}`, 'led:K')],
    rules: [{ src: 'btn.press', op: 'is', val: 1, dst: 'led', act: 'on' }, { src: 'btn.press', op: 'is', val: 0, dst: 'led', act: 'on' }] };
}

describe('Multiple rules targeting one output', () => {
  it('keeps the Blink example LED on for both complementary on rules', () => {
    const doc = EXAMPLES.blink[1](); const first = doc.rules[0];
    doc.rules.push({ ...first, uid: 'second', val: 0 });
    const A = analyze(doc); const sim = new Sim();
    for (const pressed of [true, false]) {
      sim.set(first.src.split('.')[0], 'press', pressed);
      expect(sim.tick(A, 0.2).outputs.get(first.dst).on).toBe(true);
    }
    expect(generate(A, 'arduino').code).toContain('if (!button_1_press) { digitalWrite(13, HIGH); } else if (button_1_press) { digitalWrite(13, HIGH); } else { digitalWrite(13, LOW); }');
  });

  it.each([
    ['uno', 'arduino', 'if (!button_1_press) { digitalWrite(13, HIGH); } else if (button_1_press) { digitalWrite(13, HIGH); } else { digitalWrite(13, LOW); }'],
    ['esp32', 'micropython', 'if not button_1_press:\n        led_1.value(1)\n    elif button_1_press:\n        led_1.value(1)\n    else:\n        led_1.value(0)'],
    ['pi5', 'python', 'if not button_1_press:\n        led_1.on()\n    elif button_1_press:\n        led_1.on()\n    else:\n        led_1.off()'],
  ])('exports one precedence chain for %s %s', (board, lang, chain) => {
    const A = analyze(buttonLed(board));
    expect(A.conn.get('btn').ok).toBe(true); expect(A.conn.get('led').ok).toBe(true);
    expect(generate(A, lang).code).toContain(chain);
  });

  it('uses the last matching action and turns off if no rule matches', () => {
    const doc = EXAMPLES.plant[1](); const soil = doc.items.find(x => x.type === 'soil'); const relay = doc.items.find(x => x.type === 'relay');
    doc.rules = [{ src: `${soil.uid}.moist`, op: '<', val: 70, dst: relay.uid, act: 'on' }, { src: `${soil.uid}.moist`, op: '<', val: 30, dst: relay.uid, act: 'off' }];
    const A = analyze(doc); const sim = new Sim();
    for (const [moist, on] of [[10, false], [50, true], [90, false]]) { sim.set(soil.uid, 'moist', moist); expect(sim.tick(A, 0.2).outputs.get(relay.uid).on).toBe(on); }
    const code = generate(A, 'arduino').code;
    expect(code).toMatch(/if \(soil_1_moist < 30\) \{ digitalWrite\(\d+, HIGH\); \} else if \(soil_1_moist < 70\) \{ digitalWrite\(\d+, LOW\); \} else \{ digitalWrite\(\d+, HIGH\); \}/);
  });
});
