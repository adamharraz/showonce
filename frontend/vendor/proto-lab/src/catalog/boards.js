/**
 * Development boards. Units: mm. Local coordinates: x along the board's long side,
 * y across it (top of the board = −y), origin at the board centre. Header pitch 2.54 mm.
 * Pin layouts follow the published pinouts; component placement is simplified.
 */
const P = 2.54;
const row = (names, x0, y, dx = P) => names.map((n, i) => ({ n, x: x0 + i * dx, y }));
const dedupe = (pins) => { const count = {}, seen = {}; for (const p of pins) count[p.n] = (count[p.n] || 0) + 1; return pins.map((p) => { if (count[p.n] < 2) return p; seen[p.n] = (seen[p.n] || 0) + 1; return { ...p, n: `${p.n}.${seen[p.n]}` }; }); };
export const label = (n) => n.replace(/\.\d+$/, '');

// ── Pin roles & capabilities per family ────────────────────────────────────
function avrPin(n, mega) {
  const b = label(n);
  if (b === 'GND') return { role: 'gnd' };
  if (b === '5V') return { role: 'p5' };
  if (b === '3V3') return { role: 'p33' };
  if (b === 'VIN') return { role: 'vin' };
  if (['AREF', 'IOREF', 'RESET', 'NC'].includes(b)) return { role: 'other' };
  if (b === 'SDA') return { role: 'gpio', code: 'SDA', caps: ['sda'] };
  if (b === 'SCL') return { role: 'gpio', code: 'SCL', caps: ['scl'] };
  const a = b.match(/^A(\d+)$/);
  if (a) { const k = +a[1]; const caps = ['adc']; if (!mega && k === 4) caps.push('sda'); if (!mega && k === 5) caps.push('scl'); return { role: 'gpio', code: `A${k}`, caps }; }
  const d = b.match(/^D(\d+)$/);
  if (d) {
    const k = +d[1], caps = [];
    if ((mega ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46] : [3, 5, 6, 9, 10, 11]).includes(k)) caps.push('pwm');
    if (k === 0) caps.push('rx'); if (k === 1) caps.push('tx');
    if (mega) { if (k === 20) caps.push('sda'); if (k === 21) caps.push('scl'); if (k === 51) caps.push('mosi'); if (k === 50) caps.push('miso'); if (k === 52) caps.push('sck'); if (k === 53) caps.push('cs'); }
    else { if (k === 11) caps.push('mosi'); if (k === 12) caps.push('miso'); if (k === 13) caps.push('sck'); if (k === 10) caps.push('cs'); }
    if ([2, 3].includes(k) || (mega && [18, 19, 20, 21].includes(k))) caps.push('int');
    return { role: 'gpio', code: String(k), caps };
  }
  return { role: 'other' };
}
const ESP32_ADC = [32, 33, 34, 35, 36, 39, 25, 26, 27, 14, 12, 13, 15, 2, 4, 0];
function esp32Pin(n) {
  const b = label(n);
  if (b === 'GND') return { role: 'gnd' };
  if (b === '3V3') return { role: 'p33' };
  if (b === '5V') return { role: 'p5' };
  if (b === 'EN') return { role: 'other' };
  if (['D0', 'D1', 'D2', 'D3', 'CMD', 'CLK'].includes(b)) return { role: 'flash' };
  const g = b === 'VP' ? 36 : b === 'VN' ? 39 : b === 'TX' ? 1 : b === 'RX' ? 3 : +b;
  if (Number.isNaN(g)) return { role: 'other' };
  const caps = [];
  if (ESP32_ADC.includes(g)) caps.push('adc');
  if (g < 34) caps.push('pwm'); else caps.push('inputOnly');
  if (g === 21) caps.push('sda'); if (g === 22) caps.push('scl');
  if (g === 23) caps.push('mosi'); if (g === 19) caps.push('miso'); if (g === 18) caps.push('sck'); if (g === 5) caps.push('cs');
  if (g === 1) caps.push('tx'); if (g === 3) caps.push('rx');
  if ([0, 2, 5, 12, 15].includes(g)) caps.push('strap');
  if ([25, 26].includes(g)) caps.push('dac');
  if ([25, 26, 27, 14, 12, 13, 15, 2, 4, 0].includes(g)) caps.push('adc2');
  return { role: 'gpio', code: String(g), caps };
}
const NODEMCU = { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, RX: 3, TX: 1 };
function esp8266Pin(n) {
  const b = label(n);
  if (b === 'GND') return { role: 'gnd' };
  if (b === '3V3') return { role: 'p33' };
  if (b === 'VIN') return { role: 'p5' };
  if (b === 'A0') return { role: 'gpio', code: 'A0', caps: ['adc', 'adcOnly'] };
  if (['SD3', 'SD2', 'SD1', 'CMD', 'SD0', 'CLK'].includes(b)) return { role: 'flash' };
  if (NODEMCU[b] === undefined) return { role: 'other' };
  const g = NODEMCU[b], caps = [];
  if (g !== 16) caps.push('pwm');
  if (b === 'D2') caps.push('sda'); if (b === 'D1') caps.push('scl');
  if (b === 'D7') caps.push('mosi'); if (b === 'D6') caps.push('miso'); if (b === 'D5') caps.push('sck'); if (b === 'D8') caps.push('cs');
  if (b === 'TX') caps.push('tx'); if (b === 'RX') caps.push('rx');
  if (['D3', 'D4', 'D8'].includes(b)) caps.push('strap');
  return { role: 'gpio', code: b, caps };
}
function rpiPin(n) {
  const b = label(n);
  if (b === 'GND') return { role: 'gnd' };
  if (b === '5V') return { role: 'p5' };
  if (b === '3V3') return { role: 'p33' };
  const g = b.match(/^GPIO(\d+)$/);
  if (!g) return { role: 'other' };
  const k = +g[1], caps = [];
  if ([12, 13, 18, 19].includes(k)) caps.push('pwm');
  if (k === 2) caps.push('sda'); if (k === 3) caps.push('scl');
  if (k === 10) caps.push('mosi'); if (k === 9) caps.push('miso'); if (k === 11) caps.push('sck'); if (k === 8 || k === 7) caps.push('cs');
  if (k === 14) caps.push('tx'); if (k === 15) caps.push('rx');
  if (k === 0 || k === 1) caps.push('reserved');
  return { role: 'gpio', code: String(k), caps };
}
function picoPin(n) {
  const b = label(n);
  if (b === 'GND' || b === 'AGND') return { role: 'gnd' };
  if (b === 'VBUS') return { role: 'p5' };
  if (b === 'VSYS') return { role: 'vin' };
  if (b === '3V3') return { role: 'p33' };
  const g = b.match(/^GP(\d+)$/);
  if (!g) return { role: 'other' };
  const k = +g[1], caps = ['pwm'];
  if ([26, 27, 28].includes(k)) caps.push('adc');
  if ([0, 4, 8, 12, 16, 20, 2, 6, 10, 14, 18, 26].includes(k)) caps.push('sda');
  if ([1, 5, 9, 13, 17, 21, 3, 7, 11, 15, 19, 27].includes(k)) caps.push('scl');
  if ([3, 7, 19].includes(k)) caps.push('mosi'); if ([4, 0, 16].includes(k)) caps.push('miso'); if ([2, 6, 18].includes(k)) caps.push('sck');
  if (k === 0) caps.push('tx'); if (k === 1) caps.push('rx');
  return { role: 'gpio', code: String(k), caps };
}

// ── Boards ─────────────────────────────────────────────────────────────────
function uno() {
  const W = 68.6, H = 53.3, X = (x) => x - W / 2, Y = (y) => y - H / 2;
  const top = [...row(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], X(18.9), Y(2.54)), ...row(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], X(45.82), Y(2.54))];
  const bot = [...row(['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN'], X(28.04), Y(50.8)), ...row(['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], X(50.9), Y(50.8))];
  return {
    w: W, h: H, pcb: '#0a6f8f', header: 'female', pins: dedupe([...top, ...bot]),
    feats: [
      { t: 'box', x: X(1.5), y: Y(15.5), w: 16, d: 12, h: 10.9, c: '#c9ccd1', name: 'USB-B' },
      { t: 'box', x: X(0.5), y: Y(43.5), w: 14, d: 9, h: 11, c: '#1b1b1d', name: 'DC jack' },
      { t: 'chip', x: X(48), y: Y(37), w: 35.6, d: 7.6, h: 4, c: '#1c1c1f', label: 'ATMEGA328P-PU', dip: 28 },
      { t: 'chip', x: X(19), y: Y(15), w: 5, d: 5, h: 1, c: '#1c1c1f', label: '16U2' },
      { t: 'box', x: X(7), y: Y(4.5), w: 6, d: 6, h: 3.5, c: '#d8d8d8', name: 'Reset' },
      { t: 'cyl', x: X(15), y: Y(42), r: 3, h: 8, c: '#3a3a3c' }, { t: 'cyl', x: X(21), y: Y(42), r: 3, h: 8, c: '#3a3a3c' },
      { t: 'box', x: X(36), y: Y(37), w: 8, d: 3, h: 3, c: '#c9ccd1', name: 'Crystal' },
      { t: 'led', x: X(27), y: Y(9), c: '#ffb020', pin: 'D13' }, { t: 'led', x: X(56), y: Y(29), c: '#3cff6e', power: true },
    ],
    silk: 'UNO', logic: 5, family: 'arduino-avr', bridges: [['A4', 'SDA'], ['A5', 'SCL']], builtinLed: 'D13',
    roles: (n) => avrPin(n, false),
  };
}
function mega() {
  const W = 101.6, H = 53.3, X = (x) => x - W / 2, Y = (y) => y - H / 2;
  const top = [...row(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], X(18.9), Y(2.54)), ...row(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], X(45.82), Y(2.54)), ...row(['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'], X(67.0), Y(2.54))];
  const bot = [...row(['NC', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND', 'VIN'], X(28.04), Y(50.8)), ...row(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], X(50.9), Y(50.8)), ...row(['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'], X(73.0), Y(50.8))];
  const dbl = [];
  for (let i = 0; i < 18; i++) {
    const a = i === 0 ? '5V' : i === 17 ? 'GND' : `D${22 + (i - 1) * 2}`, b = i === 0 ? '5V' : i === 17 ? 'GND' : `D${23 + (i - 1) * 2}`;
    dbl.push({ n: a, x: X(93.98), y: Y(7.62 + i * P) }, { n: b, x: X(96.52), y: Y(7.62 + i * P) });
  }
  return {
    w: W, h: H, pcb: '#0a6f8f', header: 'female', pins: dedupe([...top, ...bot, ...dbl]),
    feats: [
      { t: 'box', x: X(1.5), y: Y(15.5), w: 16, d: 12, h: 10.9, c: '#c9ccd1', name: 'USB-B' },
      { t: 'box', x: X(0.5), y: Y(43.5), w: 14, d: 9, h: 11, c: '#1b1b1d', name: 'DC jack' },
      { t: 'chip', x: X(55), y: Y(28), w: 14, d: 14, h: 1.4, c: '#1c1c1f', label: 'ATMEGA2560', rot: 45 },
      { t: 'chip', x: X(19), y: Y(15), w: 5, d: 5, h: 1, c: '#1c1c1f', label: '16U2' },
      { t: 'led', x: X(27), y: Y(9), c: '#ffb020', pin: 'D13' }, { t: 'led', x: X(80), y: Y(29), c: '#3cff6e', power: true },
    ],
    silk: 'MEGA 2560', logic: 5, family: 'arduino-avr', mega: true, bridges: [['D20', 'SDA'], ['D21', 'SCL']], builtinLed: 'D13',
    roles: (n) => avrPin(n, true),
  };
}
function nano() {
  const W = 43.2, H = 18;
  const a = row(['TX', 'RX', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'], -17.78, -7.62);
  const b = row(['VIN', 'GND', 'RST', '5V', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'AREF', '3V3', 'D13'], -17.78, 7.62);
  const pins = dedupe([...a, ...b]).map((p) => ({ ...p, n: p.n === 'TX' ? 'D1' : p.n === 'RX' ? 'D0' : p.n }));
  return {
    w: W, h: H, pcb: '#0a6f8f', header: 'male', bbFit: true, pins,
    feats: [{ t: 'box', x: -21, y: 0, w: 8, d: 7.6, h: 4, c: '#c9ccd1', name: 'Mini-USB' }, { t: 'chip', x: 3, y: 0, w: 7, d: 7, h: 1.2, c: '#1c1c1f', label: '328P', rot: 45 }, { t: 'box', x: -8, y: 0, w: 4, d: 3, h: 2, c: '#d8d8d8' }, { t: 'led', x: 14, y: -3, c: '#ffb020', pin: 'D13' }, { t: 'led', x: 14, y: 3, c: '#3cff6e', power: true }],
    silk: 'NANO', logic: 5, family: 'arduino-avr', bridges: [], builtinLed: 'D13',
    roles: (n) => avrPin(n, false),
  };
}
function piHeader(x0, yEdge) {
  const names = ['3V3', '5V', 'GPIO2', '5V', 'GPIO3', 'GND', 'GPIO4', 'GPIO14', 'GND', 'GPIO15', 'GPIO17', 'GPIO18', 'GPIO27', 'GND', 'GPIO22', 'GPIO23', '3V3', 'GPIO24', 'GPIO10', 'GND', 'GPIO9', 'GPIO25', 'GPIO11', 'GPIO8', 'GND', 'GPIO7', 'GPIO0', 'GPIO1', 'GPIO5', 'GND', 'GPIO6', 'GPIO12', 'GPIO13', 'GND', 'GPIO19', 'GPIO16', 'GPIO26', 'GPIO20', 'GND', 'GPIO21'];
  return dedupe(names.map((n, i) => ({ n, x: x0 + Math.floor(i / 2) * P, y: i % 2 === 0 ? yEdge + P : yEdge, phys: i + 1 })));
}
function pi5() {
  const W = 85, H = 56, X = (x) => x - W / 2, Y = (y) => y - H / 2;
  return {
    w: W, h: H, pcb: '#2e8b3a', header: 'male-up', pins: piHeader(X(8.0), Y(2.23)),
    feats: [
      { t: 'box', x: X(74.5), y: Y(10), w: 21, d: 16, h: 13.5, c: '#c9ccd1', name: 'Ethernet' },
      { t: 'box', x: X(76), y: Y(29), w: 18, d: 14, h: 16, c: '#1f5bd8', name: 'USB 3' },
      { t: 'box', x: X(76), y: Y(47), w: 18, d: 14, h: 16, c: '#1b1b1d', name: 'USB 2' },
      { t: 'chip', x: X(29), y: Y(32), w: 15, d: 15, h: 1.6, c: '#b8bcc4', label: 'BCM2712', metal: true },
      { t: 'chip', x: X(48), y: Y(32), w: 10, d: 14, h: 1.2, c: '#1c1c1f', label: 'RP1' },
      { t: 'chip', x: X(29), y: Y(47.5), w: 12, d: 8, h: 1, c: '#1c1c1f', label: 'LPDDR4X' },
      { t: 'box', x: X(11.2), y: Y(53), w: 9, d: 7, h: 3.2, c: '#c9ccd1', name: 'USB-C' },
      { t: 'box', x: X(26), y: Y(53), w: 7, d: 7.5, h: 3.2, c: '#c9ccd1', name: 'micro-HDMI' }, { t: 'box', x: X(39.5), y: Y(53), w: 7, d: 7.5, h: 3.2, c: '#c9ccd1', name: 'micro-HDMI' },
      { t: 'box', x: X(2.5), y: Y(22), w: 5, d: 6, h: 2, c: '#2b2b2b', name: 'Power button' },
      { t: 'led', x: X(3), y: Y(31), c: '#3cff6e', power: true },
    ],
    silk: 'Raspberry Pi 5', logic: 3.3, family: 'rpi', bridges: [], noAdc: true,
    roles: rpiPin,
  };
}
function pizero() {
  const W = 65, H = 30, X = (x) => x - W / 2, Y = (y) => y - H / 2;
  return {
    w: W, h: H, pcb: '#2e8b3a', header: 'male-up', pins: piHeader(X(8.37), Y(2.23)),
    feats: [{ t: 'chip', x: X(32), y: Y(18), w: 14, d: 14, h: 1.4, c: '#b8bcc4', label: 'RP3A0', metal: true }, { t: 'box', x: X(54), y: Y(28.5), w: 8, d: 5.5, h: 2.6, c: '#c9ccd1', name: 'micro-USB' }, { t: 'box', x: X(41.4), y: Y(28.5), w: 8, d: 5.5, h: 2.6, c: '#c9ccd1', name: 'micro-USB' }, { t: 'box', x: X(12.4), y: Y(27.5), w: 11, d: 7, h: 3.2, c: '#c9ccd1', name: 'mini-HDMI' }, { t: 'led', x: X(61), y: Y(24), c: '#3cff6e', power: true }],
    silk: 'Pi Zero 2 W', logic: 3.3, family: 'rpi', bridges: [], noAdc: true,
    roles: rpiPin,
  };
}
function pico() {
  const W = 51, H = 21;
  const left = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'];
  const right = ['GP16', 'GP17', 'GND', 'GP18', 'GP19', 'GP20', 'GP21', 'GND', 'GP22', 'RUN', 'GP26', 'GP27', 'AGND', 'GP28', 'ADC_VREF', '3V3', '3V3_EN', 'GND', 'VSYS', 'VBUS'];
  const pins = [...left.map((n, i) => ({ n, x: -24.13 + i * P, y: 8.89 })), ...right.map((n, i) => ({ n, x: 24.13 - i * P, y: -8.89 }))];
  return {
    w: W, h: H, pcb: '#2e8b3a', header: 'male', bbFit: true, pins: dedupe(pins),
    feats: [{ t: 'box', x: -23.5, y: 0, w: 6, d: 8, h: 3, c: '#c9ccd1', name: 'micro-USB' }, { t: 'chip', x: 2, y: 0, w: 7, d: 7, h: 1, c: '#1c1c1f', label: 'RP2040' }, { t: 'chip', x: -10, y: 0, w: 5, d: 6, h: 1.2, c: '#1c1c1f', label: 'W25Q16' }, { t: 'box', x: -16, y: -5, w: 4, d: 3, h: 2.5, c: '#eeeeee', name: 'BOOTSEL' }, { t: 'led', x: -19, y: 4, c: '#3cff6e', pin: 'GP25' }],
    silk: 'Pico', logic: 3.3, family: 'pico', bridges: [], builtinLed: 'GP25',
    roles: picoPin,
  };
}
function esp32() {
  const W = 54.4, H = 27.9;
  const a = ['3V3', 'EN', 'VP', 'VN', '34', '35', '32', '33', '25', '26', '27', '14', '12', 'GND', '13', 'D2', 'D3', 'CMD', '5V'];
  const b = ['GND', '23', '22', 'TX', 'RX', '21', 'GND', '19', '18', '5', '17', '16', '4', '0', '2', '15', 'D1', 'D0', 'CLK'];
  const pins = [...a.map((n, i) => ({ n, x: -22.86 + i * P, y: -12.7 })), ...b.map((n, i) => ({ n, x: -22.86 + i * P, y: 12.7 }))];
  return {
    w: W, h: H, pcb: '#1c1c1f', header: 'male', bbFit: true, pins: dedupe(pins),
    feats: [{ t: 'box', x: -11, y: 0, w: 25.5, d: 18, h: 3.2, c: '#c9ccd1', name: 'ESP32-WROOM-32', metal: true, label: 'ESP32-WROOM-32' }, { t: 'box', x: -25.5, y: 0, w: 4, d: 18, h: 0.8, c: '#0f0f10' }, { t: 'box', x: 25, y: 0, w: 6, d: 8, h: 3, c: '#c9ccd1', name: 'micro-USB' }, { t: 'chip', x: 13, y: 0, w: 5, d: 5, h: 1, c: '#1c1c1f', label: 'CP2102' }, { t: 'box', x: 20, y: -9, w: 4, d: 3, h: 2, c: '#e8e8e8', name: 'EN' }, { t: 'box', x: 20, y: 9, w: 4, d: 3, h: 2, c: '#e8e8e8', name: 'BOOT' }, { t: 'led', x: 18, y: 4, c: '#ff3b30', power: true }, { t: 'led', x: 18, y: -4, c: '#3c8bff', pin: '2' }],
    silk: 'ESP32-DevKitC', logic: 3.3, family: 'esp32', bridges: [], builtinLed: '2',
    roles: esp32Pin,
  };
}
function nodemcu() {
  const W = 49, H = 26;
  const a = ['A0', 'RSV', 'RSV', 'SD3', 'SD2', 'SD1', 'CMD', 'SD0', 'CLK', 'GND', '3V3', 'EN', 'RST', 'GND', 'VIN'];
  const b = ['D0', 'D1', 'D2', 'D3', 'D4', '3V3', 'GND', 'D5', 'D6', 'D7', 'D8', 'RX', 'TX', 'GND', '3V3'];
  const pins = [...a.map((n, i) => ({ n, x: -17.78 + i * P, y: -11.43 })), ...b.map((n, i) => ({ n, x: -17.78 + i * P, y: 11.43 }))];
  return {
    w: W, h: H, pcb: '#1c1c1f', header: 'male', bbFit: true, pins: dedupe(pins),
    feats: [{ t: 'box', x: -10, y: 0, w: 24, d: 16, h: 3, c: '#c9ccd1', name: 'ESP-12E', metal: true, label: 'ESP-12E' }, { t: 'box', x: 22, y: 0, w: 6, d: 8, h: 3, c: '#c9ccd1', name: 'micro-USB' }, { t: 'chip', x: 12, y: 0, w: 5, d: 5, h: 1, c: '#1c1c1f', label: 'CP2102' }, { t: 'led', x: -14, y: -5, c: '#3c8bff', pin: 'D4' }],
    silk: 'NodeMCU ESP8266', logic: 3.3, family: 'esp8266', bridges: [], builtinLed: 'D4',
    roles: esp8266Pin,
  };
}

const DEF = {
  uno: ['Arduino Uno R3', 'ATmega328P · 5 V logic · 14 digital (6 PWM) · 6 analog in', uno],
  nano: ['Arduino Nano', 'ATmega328P · 5 V logic · breadboard-friendly · 8 analog in', nano],
  mega: ['Arduino Mega 2560', 'ATmega2560 · 5 V logic · 54 digital (15 PWM) · 16 analog in', mega],
  esp32: ['ESP32 DevKitC', 'Dual-core 240 MHz · Wi-Fi + Bluetooth · 3.3 V logic · 18 ADC channels', esp32],
  nodemcu: ['NodeMCU ESP8266', '80 MHz · Wi-Fi · 3.3 V logic · single ADC (A0)', nodemcu],
  pico: ['Raspberry Pi Pico', 'RP2040 dual Cortex-M0+ · 3.3 V logic · 3 ADC · PIO', pico],
  pi5: ['Raspberry Pi 5', 'Linux computer · 40-pin GPIO header · 3.3 V logic · no ADC', pi5],
  pizero: ['Raspberry Pi Zero 2 W', 'Linux computer · 40-pin GPIO header · 3.3 V logic · no ADC', pizero],
};
export const BOARDS = Object.fromEntries(Object.entries(DEF).map(([id, [name, desc, f]]) => {
  const b = f();
  b.pins = b.pins.map((p) => ({ ...p, ...b.roles(p.n) }));
  return [id, { id, name, desc, kind: 'board', cat: 'Boards', ...b }];
}));
