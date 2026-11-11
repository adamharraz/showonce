/**
 * Sensors, modules, passives and power parts.
 *
 * Pin types
 *   vcc  supply input      gnd  ground          src  supply output (power parts)
 *   do   module → board    di   board → module  dio  bidirectional (1-Wire, DHT)
 *   ao   analog output (needs an ADC)           pwm  needs a PWM-capable output
 *   sda scl mosi miso sck cs  bus pins          tx rx  UART (module's own view)
 *   a k  LED anode/cathode                       p  passive terminal
 *
 * Electrical fields: vmin/vmax (supply range, V), ma (typical current), outV (signal level
 * if not equal to the supply), vih (minimum high level the module needs on inputs), i2c address.
 * `drv` selects the code driver (src/drivers.js); `vals` are simulated readings; `out` is an
 * output behaviour.
 */
const P = 2.54;
const hdr = (names, y, x0) => names.map((n, i) => ({ n: n[0], t: n[1], x: (x0 ?? -((names.length - 1) * P) / 2) + i * P, y }));

const D = [];
function add(id, name, cat, desc, o) { D.push({ id, name, cat, desc, ...o }); }
/** A breakout board: PCB w × h with a male header along the +y edge. */
function mod(id, name, cat, desc, w, h, pcb, pins, o = {}) {
  add(id, name, cat, desc, { w, h, pcb, pins: hdr(pins, h / 2 - 1.4), header: 'module', ...o });
}

// ── Environment ────────────────────────────────────────────────────────────
const TEMP = { k: 'temp', l: 'Temperature', u: '°C', min: -20, max: 60, v: 24, step: 0.5 };
const HUM = { k: 'hum', l: 'Humidity', u: '%', min: 0, max: 100, v: 55, step: 1 };
mod('dht11', 'DHT11', 'Environment', 'Temperature 0–50 °C ±2 °C, humidity 20–90 % ±5 %. Single-wire protocol.', 15.5, 20, '#1b5fbf',
  [['VCC', 'vcc'], ['DATA', 'dio'], ['GND', 'gnd']], { vmin: 3.3, vmax: 5.5, ma: 2.5, drv: 'dht', dhtType: 'DHT11', feats: [{ t: 'grille', x: 0, y: -2, w: 12, d: 15.5, h: 5.5, c: '#2d7fe0' }], vals: [{ ...TEMP, min: 0, max: 50 }, { ...HUM, min: 20, max: 90 }] });
mod('dht22', 'DHT22 / AM2302', 'Environment', 'Temperature −40–80 °C ±0.5 °C, humidity 0–100 % ±2 %. Single-wire protocol, read every 2 s.', 15.5, 25, '#e9e9e4',
  [['VCC', 'vcc'], ['DATA', 'dio'], ['GND', 'gnd']], { vmin: 3.3, vmax: 6, ma: 1.5, drv: 'dht', dhtType: 'DHT22', feats: [{ t: 'grille', x: 0, y: -2.5, w: 15, d: 20, h: 7.7, c: '#f2f2ee' }], vals: [{ ...TEMP, min: -40, max: 80 }, HUM] });
mod('bme280', 'BME280', 'Environment', 'Temperature, humidity and pressure (300–1100 hPa). I²C at 0x76 (or 0x77).', 13, 10.5, '#7a3cbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda']], { vmin: 1.8, vmax: 3.6, ma: 0.7, i2c: 0x76, drv: 'bme280', feats: [{ t: 'box', x: 0, y: -1.5, w: 2.5, d: 2.5, h: 0.95, c: '#c9ccd1', metal: true }], vals: [TEMP, HUM, { k: 'pres', l: 'Pressure', u: 'hPa', min: 950, max: 1050, v: 1008, step: 1 }] });
mod('bmp280', 'BMP280', 'Environment', 'Temperature and barometric pressure, altitude. I²C at 0x76 (or 0x77).', 15, 11.5, '#7a3cbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda'], ['CSB', 'nc'], ['SDO', 'nc']], { vmin: 1.8, vmax: 3.6, ma: 0.7, i2c: 0x76, drv: 'bmp280', feats: [{ t: 'box', x: 0, y: -1.5, w: 2, d: 2.5, h: 0.95, c: '#c9ccd1', metal: true }], vals: [TEMP, { k: 'pres', l: 'Pressure', u: 'hPa', min: 950, max: 1050, v: 1008, step: 1 }] });
mod('sht31', 'SHT31', 'Environment', 'Precision temperature ±0.2 °C and humidity ±2 %. I²C at 0x44.', 13, 13, '#1f1f22',
  [['VIN', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda']], { vmin: 2.4, vmax: 5.5, ma: 0.8, i2c: 0x44, drv: 'sht31', feats: [{ t: 'chip', x: 0, y: -2, w: 2.5, d: 2.5, h: 0.9, c: '#d8d8d8' }], vals: [TEMP, HUM] });
mod('ds18b20', 'DS18B20 probe', 'Environment', 'Waterproof 1-Wire temperature probe, −55–125 °C. Module includes the 4.7 kΩ pull-up.', 16, 18, '#1b5fbf',
  [['VCC', 'vcc'], ['DATA', 'dio'], ['GND', 'gnd']], { vmin: 3, vmax: 5.5, ma: 1.5, drv: 'ds18b20', feats: [{ t: 'cyl', x: 0, y: -12, r: 3, h: 3, c: '#c9ccd1', metal: true, axis: 'y', len: 26 }], vals: [{ ...TEMP, min: -55, max: 125 }] });
mod('soil', 'Soil moisture (capacitive)', 'Environment', 'Capacitive probe, analog output falls as soil gets wetter.', 23, 70, '#1f1f22',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['AOUT', 'ao']], { vmin: 3.3, vmax: 5.5, ma: 5, drv: 'analog', feats: [{ t: 'box', x: 0, y: 26, w: 23, d: 16, h: 1.6, c: '#1f1f22', name: 'probe-tip' }, { t: 'chip', x: 0, y: -26, w: 5, d: 4, h: 1, c: '#1c1c1f', label: '555' }], vals: [{ k: 'moist', l: 'Moisture', u: '%', min: 0, max: 100, v: 40, step: 1 }], analogFrom: 'moist' });
mod('rain', 'Rain sensor', 'Environment', 'Rain plate with LM393 comparator: analog level and a digital threshold output.', 30, 16, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 3.3, vmax: 5, ma: 4, drv: 'analog', feats: [{ t: 'knob', x: -8, y: -3, c: '#2a6fd6' }, { t: 'chip', x: 6, y: -3, w: 5, d: 4, h: 1.2, c: '#1c1c1f', label: 'LM393' }], vals: [{ k: 'wet', l: 'Wetness', u: '%', min: 0, max: 100, v: 0, step: 1 }], analogFrom: 'wet', digitalFrom: { k: 'wet', above: 40 } });
mod('mq2', 'MQ-2 gas', 'Environment', 'Smoke, LPG and methane. Heater draws ~150 mA at 5 V; needs a 24 h burn-in.', 32, 22, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 4.8, vmax: 5.2, ma: 150, drv: 'analog', feats: [{ t: 'cyl', x: 0, y: -3, r: 9.5, h: 13, c: '#c9ccd1', metal: true, mesh: true }, { t: 'knob', x: 12, y: 5, c: '#2a6fd6' }], vals: [{ k: 'gas', l: 'Gas level', u: 'ppm', min: 200, max: 10000, v: 400, step: 50 }], analogFrom: 'gas', digitalFrom: { k: 'gas', above: 2000 } });
mod('mq135', 'MQ-135 air quality', 'Environment', 'NH₃, NOx, benzene, CO₂ trend. Heater ~150 mA at 5 V.', 32, 22, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 4.8, vmax: 5.2, ma: 150, drv: 'analog', feats: [{ t: 'cyl', x: 0, y: -3, r: 9.5, h: 13, c: '#c9ccd1', metal: true, mesh: true }, { t: 'knob', x: 12, y: 5, c: '#2a6fd6' }], vals: [{ k: 'aq', l: 'Air quality', u: 'ppm', min: 300, max: 2000, v: 450, step: 10 }], analogFrom: 'aq', digitalFrom: { k: 'aq', above: 1000 } });
mod('water', 'Water level', 'Environment', 'Exposed-trace water depth sensor, analog output.', 20, 62, '#c21f1f',
  [['S', 'ao'], ['VCC', 'vcc'], ['GND', 'gnd']], { vmin: 3, vmax: 5, ma: 20, drv: 'analog', feats: [{ t: 'traces', x: 0, y: 6, w: 16, d: 40 }], vals: [{ k: 'level', l: 'Water level', u: 'mm', min: 0, max: 40, v: 10, step: 1 }], analogFrom: 'level' });

// ── Light & colour ─────────────────────────────────────────────────────────
mod('ldr', 'LDR light sensor', 'Light & colour', 'Photoresistor divider with LM393: analog light level plus a threshold output.', 32, 14, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 3.3, vmax: 5, ma: 3, drv: 'analog', feats: [{ t: 'ldr', x: -13, y: -1, c: '#d9b25a' }, { t: 'knob', x: 3, y: -2, c: '#2a6fd6' }], vals: [{ k: 'light', l: 'Light', u: '%', min: 0, max: 100, v: 60, step: 1 }], analogFrom: 'light', digitalFrom: { k: 'light', below: 30 } });
mod('bh1750', 'BH1750', 'Light & colour', 'Digital ambient light in lux (1–65 535 lx). I²C at 0x23.', 18.5, 13.9, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda'], ['ADDR', 'nc']], { vmin: 3, vmax: 5, ma: 0.2, i2c: 0x23, drv: 'bh1750', feats: [{ t: 'chip', x: 0, y: -2, w: 3, d: 1.6, h: 0.9, c: '#1c1c1f' }], vals: [{ k: 'lux', l: 'Illuminance', u: 'lx', min: 0, max: 20000, v: 320, step: 10 }] });
mod('tcs34725', 'TCS34725 colour', 'Light & colour', 'RGB colour sensor with IR filter and white LED. I²C at 0x29.', 20, 20, '#1f1f22',
  [['LED', 'nc'], ['INT', 'nc'], ['SDA', 'sda'], ['SCL', 'scl'], ['3V3', 'nc'], ['GND', 'gnd'], ['VIN', 'vcc']], { vmin: 3.3, vmax: 5, ma: 20, i2c: 0x29, drv: 'tcs34725', feats: [{ t: 'chip', x: 0, y: -3, w: 2, d: 2.4, h: 0.6, c: '#5a4630' }, { t: 'led', x: 0, y: -7, c: '#ffffff', on: true }], vals: [{ k: 'r', l: 'Red', u: '', min: 0, max: 255, v: 200, step: 1 }, { k: 'g', l: 'Green', u: '', min: 0, max: 255, v: 80, step: 1 }, { k: 'b', l: 'Blue', u: '', min: 0, max: 255, v: 40, step: 1 }] });
mod('uv', 'GUVA-S12SD UV', 'Light & colour', 'UV-A/B photodiode; analog output ≈ UV index × 0.1 V.', 15, 20, '#1f1f22',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['OUT', 'ao']], { vmin: 2.7, vmax: 5.5, ma: 0.1, drv: 'analog', feats: [{ t: 'chip', x: 0, y: -4, w: 3, d: 2, h: 1, c: '#d4cfc3' }], vals: [{ k: 'uv', l: 'UV index', u: '', min: 0, max: 11, v: 3, step: 0.5 }], analogFrom: 'uv' });

// ── Motion & position ──────────────────────────────────────────────────────
mod('pir', 'HC-SR501 PIR', 'Motion & position', 'Passive infrared motion sensor, ~7 m range. Output is 3.3 V even on a 5 V supply.', 32, 24, '#2a8b3a',
  [['VCC', 'vcc'], ['OUT', 'do'], ['GND', 'gnd']], { vmin: 4.5, vmax: 20, ma: 0.065, outV: 3.3, drv: 'digital', feats: [{ t: 'dome', x: 0, y: -1, r: 11.5, c: '#f4f4f0' }], vals: [{ k: 'motion', l: 'Motion', bool: true, v: 0 }] });
mod('mpu6050', 'MPU-6050', 'Motion & position', '3-axis accelerometer and gyroscope. I²C at 0x68.', 21, 16, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda'], ['XDA', 'nc'], ['XCL', 'nc'], ['AD0', 'nc'], ['INT', 'nc']], { vmin: 3, vmax: 5, ma: 4, i2c: 0x68, drv: 'mpu6050', feats: [{ t: 'chip', x: 0, y: -2, w: 4, d: 4, h: 0.9, c: '#1c1c1f', label: 'MPU' }], vals: [{ k: 'ax', l: 'Accel X', u: 'm/s²', min: -20, max: 20, v: 0, step: 0.1 }, { k: 'ay', l: 'Accel Y', u: 'm/s²', min: -20, max: 20, v: 0, step: 0.1 }, { k: 'az', l: 'Accel Z', u: 'm/s²', min: -20, max: 20, v: 9.8, step: 0.1 }], tilt: true });
mod('adxl345', 'ADXL345', 'Motion & position', '3-axis ±16 g accelerometer. I²C at 0x53.', 20, 15, '#7a3cbf',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['CS', 'nc'], ['INT1', 'nc'], ['INT2', 'nc'], ['SDO', 'nc'], ['SDA', 'sda'], ['SCL', 'scl']], { vmin: 2, vmax: 5, ma: 0.14, i2c: 0x53, drv: 'adxl345', feats: [{ t: 'chip', x: 0, y: -2, w: 3, d: 5, h: 1, c: '#1c1c1f' }], vals: [{ k: 'ax', l: 'Accel X', u: 'm/s²', min: -20, max: 20, v: 0, step: 0.1 }, { k: 'ay', l: 'Accel Y', u: 'm/s²', min: -20, max: 20, v: 0, step: 0.1 }, { k: 'az', l: 'Accel Z', u: 'm/s²', min: -20, max: 20, v: 9.8, step: 0.1 }], tilt: true });
mod('hall', 'Hall effect (A3144)', 'Motion & position', 'Detects a magnet. Open-collector output, active LOW.', 18, 14, '#1f1f22',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do']], { vmin: 3.3, vmax: 24, ma: 4, outV: 'vcc', drv: 'digital', activeLow: true, feats: [{ t: 'box', x: 0, y: -4, w: 4, d: 1.5, h: 3, c: '#1c1c1f' }], vals: [{ k: 'magnet', l: 'Magnet near', bool: true, v: 0 }] });
mod('tilt', 'Tilt switch (SW-520D)', 'Motion & position', 'Ball switch closes when upright.', 18, 14, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do']], { vmin: 3.3, vmax: 5, ma: 2, drv: 'digital', feats: [{ t: 'cyl', x: 0, y: -3, r: 3, h: 9, c: '#c9ccd1', metal: true }], vals: [{ k: 'tilt', l: 'Tilted', bool: true, v: 0 }] });
mod('encoder', 'Rotary encoder (KY-040)', 'Motion & position', 'Incremental encoder, 20 detents per turn, with push switch.', 26, 19, '#1b5fbf',
  [['GND', 'gnd'], ['+', 'vcc'], ['SW', 'do'], ['DT', 'do'], ['CLK', 'do']], { vmin: 3.3, vmax: 5, ma: 1, drv: 'encoder', feats: [{ t: 'box', x: 0, y: -3, w: 12, d: 12, h: 6, c: '#c9ccd1', metal: true }, { t: 'cyl', x: 0, y: -3, r: 3, h: 20, c: '#9aa1aa', metal: true, name: 'shaft' }], vals: [{ k: 'pos', l: 'Position', u: 'steps', min: -50, max: 50, v: 0, step: 1 }, { k: 'press', l: 'Pressed', bool: true, v: 0 }] });
mod('irobstacle', 'IR obstacle', 'Motion & position', 'IR LED + photodiode, active LOW when an object is within 2–30 cm.', 31, 14, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['OUT', 'do']], { vmin: 3.3, vmax: 5, ma: 20, drv: 'digital', activeLow: true, feats: [{ t: 'cyl', x: -13, y: -3, r: 2.5, h: 6, c: '#202030', axis: 'x' }, { t: 'cyl', x: -13, y: 3, r: 2.5, h: 6, c: '#e8e8ff', axis: 'x' }, { t: 'knob', x: 4, y: 0, c: '#2a6fd6' }], vals: [{ k: 'obstacle', l: 'Obstacle', bool: true, v: 0 }] });
mod('line', 'Line tracker (TCRT5000)', 'Motion & position', 'Reflective IR sensor for line-following robots.', 32, 14, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 3.3, vmax: 5, ma: 20, drv: 'analog', feats: [{ t: 'box', x: -12, y: 0, w: 10, d: 6, h: 6, c: '#1c1c1f' }, { t: 'knob', x: 4, y: 0, c: '#2a6fd6' }], vals: [{ k: 'refl', l: 'Reflectance', u: '%', min: 0, max: 100, v: 70, step: 1 }], analogFrom: 'refl', digitalFrom: { k: 'refl', below: 30 } });

// ── Distance ───────────────────────────────────────────────────────────────
mod('hcsr04', 'HC-SR04 ultrasonic', 'Distance', 'Ultrasonic ranging 2–400 cm. Needs 5 V; ECHO is a 5 V signal.', 45, 20, '#1b5fbf',
  [['VCC', 'vcc'], ['TRIG', 'di'], ['ECHO', 'do'], ['GND', 'gnd']], { vmin: 4.5, vmax: 5.5, ma: 15, drv: 'hcsr04', vih: 2.2, feats: [{ t: 'cyl', x: -13, y: -2, r: 8, h: 12, c: '#c9ccd1', metal: true, mesh: true }, { t: 'cyl', x: 13, y: -2, r: 8, h: 12, c: '#c9ccd1', metal: true, mesh: true }, { t: 'box', x: 0, y: -6, w: 7, d: 3, h: 3, c: '#c9ccd1', metal: true }], vals: [{ k: 'dist', l: 'Distance', u: 'cm', min: 2, max: 400, v: 50, step: 1 }] });
mod('vl53l0x', 'VL53L0X time-of-flight', 'Distance', 'Laser ranging up to 2 m with mm resolution. I²C at 0x29.', 25, 13, '#7a3cbf',
  [['VIN', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda'], ['GPIO1', 'nc'], ['XSHUT', 'nc']], { vmin: 2.6, vmax: 5.5, ma: 19, i2c: 0x29, drv: 'vl53l0x', feats: [{ t: 'chip', x: 0, y: -2, w: 4.4, d: 2.4, h: 1, c: '#1c1c1f' }], vals: [{ k: 'mm', l: 'Distance', u: 'mm', min: 30, max: 2000, v: 400, step: 5 }] });
mod('sharp', 'Sharp GP2Y0A21 IR', 'Distance', 'Analog IR distance sensor 10–80 cm. Draws ~30 mA in pulses; add 10 µF across VCC.', 45, 14, '#1f1f22',
  [['VO', 'ao'], ['GND', 'gnd'], ['VCC', 'vcc']], { vmin: 4.5, vmax: 5.5, ma: 30, drv: 'analog', feats: [{ t: 'box', x: 0, y: -2, w: 30, d: 13, h: 13, c: '#1c1c1f' }, { t: 'cyl', x: -7, y: -2, r: 3.5, h: 14, c: '#3a2a50' }, { t: 'cyl', x: 7, y: -2, r: 3.5, h: 14, c: '#3a2a50' }], vals: [{ k: 'dist', l: 'Distance', u: 'cm', min: 10, max: 80, v: 30, step: 1 }], analogFrom: 'dist' });

// ── Sound, touch, biometrics, power monitoring ─────────────────────────────
mod('sound', 'Sound sensor (KY-038)', 'Sound, touch & more', 'Electret microphone with LM393: envelope (analog) and a clap threshold.', 35, 15, '#1b5fbf',
  [['AO', 'ao'], ['GND', 'gnd'], ['+', 'vcc'], ['DO', 'do']], { vmin: 3.3, vmax: 5, ma: 4, drv: 'analog', feats: [{ t: 'cyl', x: -13, y: 0, r: 4.9, h: 6, c: '#202022', axis: 'x' }, { t: 'knob', x: 0, y: -2, c: '#2a6fd6' }], vals: [{ k: 'level', l: 'Sound level', u: 'dB', min: 30, max: 110, v: 45, step: 1 }], analogFrom: 'level', digitalFrom: { k: 'level', above: 80 } });
mod('flame', 'Flame sensor', 'Sound, touch & more', 'IR photodiode for 760–1100 nm flames; output LOW on flame.', 31, 14, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DO', 'do'], ['AO', 'ao']], { vmin: 3.3, vmax: 5, ma: 4, drv: 'analog', activeLow: true, feats: [{ t: 'cyl', x: -13, y: 0, r: 2.5, h: 6, c: '#151515', axis: 'x' }, { t: 'knob', x: 4, y: 0, c: '#2a6fd6' }], vals: [{ k: 'flame', l: 'Flame IR', u: '%', min: 0, max: 100, v: 0, step: 1 }], analogFrom: 'flame', digitalFrom: { k: 'flame', above: 50 } });
mod('touch', 'Touch (TTP223)', 'Sound, touch & more', 'Capacitive touch pad, output HIGH while touched.', 15, 11, '#c21f1f',
  [['GND', 'gnd'], ['I/O', 'do'], ['VCC', 'vcc']], { vmin: 2, vmax: 5.5, ma: 0.01, outV: 'vcc', drv: 'digital', feats: [{ t: 'cyl', x: 0, y: -1.5, r: 4.5, h: 0.2, c: '#d7b34a', metal: true }], vals: [{ k: 'touch', l: 'Touched', bool: true, v: 0 }] });
mod('max30102', 'MAX30102 pulse oximeter', 'Sound, touch & more', 'Heart rate and SpO₂ by red/IR reflectance. I²C at 0x57.', 14, 13, '#7a3cbf',
  [['VIN', 'vcc'], ['SDA', 'sda'], ['SCL', 'scl'], ['INT', 'nc'], ['GND', 'gnd']], { vmin: 1.8, vmax: 5.5, ma: 1, i2c: 0x57, drv: 'max30102', feats: [{ t: 'box', x: 0, y: -2, w: 5.6, d: 3.3, h: 1.6, c: '#1c1c1f' }, { t: 'led', x: 0, y: -2, c: '#ff2a2a', on: true, small: true }], vals: [{ k: 'bpm', l: 'Heart rate', u: 'bpm', min: 40, max: 180, v: 72, step: 1 }, { k: 'spo2', l: 'SpO₂', u: '%', min: 85, max: 100, v: 98, step: 1 }] });
mod('hx711', 'HX711 + load cell', 'Sound, touch & more', '24-bit ADC for strain-gauge load cells (5 kg cell included). Clock/data protocol.', 21, 34, '#2a8b3a',
  [['GND', 'gnd'], ['DT', 'do'], ['SCK', 'di'], ['VCC', 'vcc']], { vmin: 2.6, vmax: 5.5, ma: 1.5, drv: 'hx711', feats: [{ t: 'chip', x: 0, y: -2, w: 5, d: 6, h: 1.2, c: '#1c1c1f', label: 'HX711' }, { t: 'box', x: 0, y: -26, w: 80, d: 12.7, h: 12.7, c: '#c9ccd1', metal: true, name: 'cell' }], vals: [{ k: 'grams', l: 'Weight', u: 'g', min: 0, max: 5000, v: 250, step: 5 }] });
mod('ina219', 'INA219 current monitor', 'Sound, touch & more', 'High-side current, bus voltage and power, ±3.2 A. I²C at 0x40.', 25, 20, '#7a3cbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda']], { vmin: 3, vmax: 5.5, ma: 1, i2c: 0x40, drv: 'ina219', feats: [{ t: 'box', x: 0, y: -5, w: 10, d: 7, h: 8, c: '#2a8b3a', name: 'terminal' }, { t: 'box', x: 6, y: 2, w: 6, d: 3, h: 0.6, c: '#1c1c1f' }], vals: [{ k: 'ma', l: 'Current', u: 'mA', min: 0, max: 3200, v: 180, step: 5 }, { k: 'volts', l: 'Bus voltage', u: 'V', min: 0, max: 26, v: 12, step: 0.1 }] });
mod('acs712', 'ACS712 current (5 A)', 'Sound, touch & more', 'Hall-effect current sensor, 185 mV/A centred at VCC/2.', 31, 13, '#c21f1f',
  [['VCC', 'vcc'], ['OUT', 'ao'], ['GND', 'gnd']], { vmin: 4.5, vmax: 5.5, ma: 10, drv: 'analog', feats: [{ t: 'box', x: -10, y: -1, w: 8, d: 9, h: 9, c: '#2a8bd6', name: 'terminal' }, { t: 'chip', x: 4, y: 0, w: 5, d: 4, h: 1.2, c: '#1c1c1f' }], vals: [{ k: 'amps', l: 'Current', u: 'A', min: -5, max: 5, v: 0.4, step: 0.05 }], analogFrom: 'amps' });
mod('joystick', 'Analog joystick', 'Inputs', 'Two 10 kΩ potentiometers (X/Y) and a push switch.', 34, 26, '#1f1f22',
  [['GND', 'gnd'], ['+5V', 'vcc'], ['VRX', 'ao'], ['VRY', 'ao'], ['SW', 'do']], { vmin: 3.3, vmax: 5, ma: 1, drv: 'joystick', feats: [{ t: 'box', x: 0, y: -2, w: 16, d: 16, h: 9, c: '#c9ccd1', metal: true }, { t: 'cyl', x: 0, y: -2, r: 6, h: 18, c: '#202022', name: 'stick' }], vals: [{ k: 'x', l: 'X', u: '%', min: -100, max: 100, v: 0, step: 1 }, { k: 'y', l: 'Y', u: '%', min: -100, max: 100, v: 0, step: 1 }, { k: 'press', l: 'Pressed', bool: true, v: 0 }] });

// ── Inputs (discrete) ──────────────────────────────────────────────────────
add('button', 'Push button', 'Inputs', '6 mm tactile switch. Wire one leg to a GPIO and the other to GND to use the internal pull-up.', {
  w: 7.62 + 2, h: 6.5, pcb: null, header: 'legs', pins: [{ n: '1', t: 'sw', x: -3.81, y: 0 }, { n: '2', t: 'sw', x: 3.81, y: 0 }], drv: 'button',
  feats: [{ t: 'box', x: 0, y: 0, w: 6, d: 6, h: 3.5, c: '#2a2a2c' }, { t: 'cyl', x: 0, y: 0, r: 1.7, h: 5, c: '#e0262b', name: 'cap' }], vals: [{ k: 'press', l: 'Pressed', bool: true, v: 0 }],
  props: { cap: { l: 'Cap colour', opts: ['#e0262b', '#2a6fd6', '#2fbf4a', '#ffd23f', '#202022'] } },
});
add('pot', 'Potentiometer 10 kΩ', 'Inputs', 'Rotary pot as a voltage divider; wiper to an analog pin.', {
  w: 10, h: 10, pcb: null, header: 'legs', pins: [{ n: 'VCC', t: 'vcc', x: -P, y: 3 }, { n: 'OUT', t: 'ao', x: 0, y: 3 }, { n: 'GND', t: 'gnd', x: P, y: 3 }], vmin: 0, vmax: 30, ma: 0.5, drv: 'analog',
  feats: [{ t: 'box', x: 0, y: -1, w: 9.5, d: 9.5, h: 6, c: '#2a6fd6' }, { t: 'cyl', x: 0, y: -1, r: 3, h: 15, c: '#c9ccd1', metal: true, name: 'shaft' }], vals: [{ k: 'pos', l: 'Position', u: '%', min: 0, max: 100, v: 50, step: 1 }], analogFrom: 'pos', ratiometric: true,
});
mod('rc522', 'RC522 RFID', 'Inputs', '13.56 MHz MIFARE reader. SPI, 3.3 V only (inputs are not 5 V tolerant).', 40, 60, '#1b5fbf',
  [['SDA', 'cs'], ['SCK', 'sck'], ['MOSI', 'mosi'], ['MISO', 'miso'], ['IRQ', 'nc'], ['GND', 'gnd'], ['RST', 'di'], ['3.3V', 'vcc']], { vmin: 2.5, vmax: 3.6, ma: 26, inMax: 3.6, drv: 'rc522', feats: [{ t: 'traces', x: 0, y: -8, w: 34, d: 34, coil: true }, { t: 'chip', x: 0, y: 20, w: 5, d: 5, h: 1, c: '#1c1c1f' }], vals: [{ k: 'card', l: 'Card present', bool: true, v: 0 }] });
mod('irrecv', 'IR receiver (VS1838B)', 'Inputs', '38 kHz IR remote receiver, demodulated output.', 15, 12, '#1f1f22',
  [['OUT', 'do'], ['GND', 'gnd'], ['VCC', 'vcc']], { vmin: 2.7, vmax: 5.5, ma: 1.5, drv: 'irrecv', feats: [{ t: 'dome', x: 0, y: -2, r: 3, c: '#202022' }], vals: [{ k: 'code', l: 'Key code', u: '', min: 0, max: 255, v: 0, step: 1 }] });
mod('gps', 'NEO-6M GPS', 'Inputs', 'u-blox GPS, NMEA at 9600 baud over UART.', 25, 35, '#1b5fbf',
  [['VCC', 'vcc'], ['RX', 'rx'], ['TX', 'tx'], ['GND', 'gnd']], { vmin: 3, vmax: 5, ma: 45, drv: 'gps', feats: [{ t: 'box', x: 0, y: -6, w: 25, d: 25, h: 4, c: '#d9b25a', name: 'antenna' }, { t: 'cyl', x: 9, y: 9, r: 3, h: 3, c: '#3a3a3c' }], vals: [{ k: 'lat', l: 'Latitude', u: '°', min: -90, max: 90, v: 18.52, step: 0.01 }, { k: 'lon', l: 'Longitude', u: '°', min: -180, max: 180, v: 73.86, step: 0.01 }] });

// ── Outputs ────────────────────────────────────────────────────────────────
const LED_COL = { Red: '#ff2b2b', Green: '#2bff5b', Blue: '#2b7bff', Yellow: '#ffd82b', White: '#ffffff', Orange: '#ff8a1f' };
add('led', 'LED 5 mm', 'Outputs', 'Needs a series resistor (220–330 Ω at 5 V, 100–150 Ω at 3.3 V). Long leg is the anode (+).', {
  w: 6, h: 6, pcb: null, header: 'legs', pins: [{ n: 'A', t: 'a', x: -P / 2, y: 0 }, { n: 'K', t: 'k', x: P / 2, y: 0 }], ma: 15, drv: 'led', out: 'led',
  feats: [{ t: 'led5', x: 0, y: 0, name: 'lamp' }], props: { color: { l: 'Colour', opts: Object.keys(LED_COL), map: LED_COL, def: 'Red' } },
});
add('rgbled', 'RGB LED (common cathode)', 'Outputs', 'Three LEDs in one package; one resistor per colour pin.', {
  w: 9, h: 6, pcb: null, header: 'legs', pins: [{ n: 'R', t: 'a', x: -1.5 * P, y: 0 }, { n: 'GND', t: 'k', x: -0.5 * P, y: 0 }, { n: 'G', t: 'a', x: 0.5 * P, y: 0 }, { n: 'B', t: 'a', x: 1.5 * P, y: 0 }], ma: 45, drv: 'rgb', out: 'rgb',
  feats: [{ t: 'led5', x: 0, y: 0, name: 'lamp', diffused: true }],
});
add('resistor', 'Resistor', 'Passives', 'Axial resistor across 4 holes (0.4″). Choose the value in the inspector.', {
  w: 12, h: 3, pcb: null, header: 'legs', pins: [{ n: '1', t: 'p', x: -2 * P, y: 0 }, { n: '2', t: 'p', x: 2 * P, y: 0 }], passive: 'resistor',
  feats: [{ t: 'resistor', x: 0, y: 0 }], props: { ohms: { l: 'Resistance', opts: ['100', '220', '330', '1k', '4.7k', '10k', '100k'], def: '220' } },
});
mod('buzzer', 'Active buzzer', 'Outputs', 'Beeps at ~2.3 kHz when driven HIGH. ~30 mA.', 18, 14, '#1f1f22',
  [['I/O', 'di'], ['VCC', 'vcc'], ['GND', 'gnd']], { vmin: 3.3, vmax: 5, ma: 30, drv: 'buzzer', out: 'buzzer', feats: [{ t: 'cyl', x: 0, y: -2, r: 6, h: 9, c: '#1c1c1f', name: 'body' }] });
mod('piezo', 'Passive piezo', 'Outputs', 'Needs a square wave — use tone() / PWM to play notes.', 18, 14, '#1b5fbf',
  [['S', 'tone'], ['VCC', 'nc'], ['GND', 'gnd']], { vmin: 0, vmax: 30, ma: 10, drv: 'piezo', out: 'buzzer', feats: [{ t: 'cyl', x: 0, y: -2, r: 6, h: 7, c: '#1c1c1f', name: 'body' }] });
mod('oled', 'OLED 0.96″ SSD1306', 'Outputs', '128×64 monochrome OLED. I²C at 0x3C.', 27, 27, '#1b4fa8',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['SCL', 'scl'], ['SDA', 'sda']], { vmin: 3.3, vmax: 5, ma: 20, i2c: 0x3c, drv: 'oled', out: 'display', feats: [{ t: 'screen', x: 0, y: -1.5, w: 25, d: 15, kind: 'oled', name: 'screen' }] });
mod('lcd1602', 'LCD 1602 + I²C backpack', 'Outputs', '16×2 character LCD with a PCF8574 backpack. 5 V. I²C at 0x27.', 80, 36, '#2a8b3a',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['SDA', 'sda'], ['SCL', 'scl']], { vmin: 4.5, vmax: 5.5, ma: 25, i2c: 0x27, drv: 'lcd', out: 'display', feats: [{ t: 'box', x: 0, y: -2, w: 71, d: 24, h: 7, c: '#1c1c1f' }, { t: 'screen', x: 0, y: -2, w: 64.5, d: 16, kind: 'lcd', name: 'screen', z: 7 }] });
mod('tm1637', '4-digit 7-segment (TM1637)', 'Outputs', 'Clock-style display with colon. Two-wire CLK/DIO.', 42, 24, '#1b5fbf',
  [['CLK', 'di'], ['DIO', 'dio'], ['VCC', 'vcc'], ['GND', 'gnd']], { vmin: 3.3, vmax: 5.5, ma: 30, drv: 'tm1637', out: 'display', feats: [{ t: 'box', x: 0, y: -2, w: 40, d: 18, h: 7, c: '#16161a' }, { t: 'screen', x: 0, y: -2, w: 38, d: 16, kind: 'seg7', name: 'screen', z: 7 }] });
mod('max7219', '8×8 LED matrix (MAX7219)', 'Outputs', '64 red LEDs driven over SPI-style DIN/CS/CLK.', 32, 50, '#1b5fbf',
  [['VCC', 'vcc'], ['GND', 'gnd'], ['DIN', 'mosi'], ['CS', 'cs'], ['CLK', 'sck']], { vmin: 4, vmax: 5.5, ma: 160, drv: 'max7219', out: 'display', vih: 3.5, feats: [{ t: 'box', x: 0, y: -6, w: 32, d: 32, h: 8, c: '#16161a' }, { t: 'screen', x: 0, y: -6, w: 31, d: 31, kind: 'matrix', name: 'screen', z: 8 }] });
mod('neopixel', 'NeoPixel ring (12 × WS2812B)', 'Outputs', 'Addressable RGB LEDs. 5 V, up to 60 mA per pixel at full white; 300–500 Ω on DIN recommended.', 37, 37, '#1f1f22',
  [['DIN', 'di'], ['5V', 'vcc'], ['GND', 'gnd']], { vmin: 4, vmax: 5.5, ma: 240, vih: 3.5, drv: 'neopixel', out: 'neopixel', round: true, feats: [{ t: 'pixels', x: 0, y: -2, r: 15, n: 12, name: 'pixels' }] });

// ── Motors & actuators ─────────────────────────────────────────────────────
mod('servo', 'Servo SG90', 'Motors & actuators', 'Micro servo 0–180°, 50 Hz PWM. Stall current ~650 mA — power from 5 V, not 3.3 V.', 23, 12.5, null,
  [['PWM', 'servo'], ['V+', 'vcc'], ['GND', 'gnd']], { vmin: 4.8, vmax: 6, ma: 250, drv: 'servo', out: 'servo', wires: ['#ff8a1f', '#e0262b', '#6b4a2a'], feats: [{ t: 'box', x: 0, y: -12, w: 23, d: 12.5, h: 22.5, c: '#2a6fd6' }, { t: 'box', x: 0, y: -12, w: 32, d: 12.5, h: 2.5, c: '#2a6fd6', z: 15.5 }, { t: 'cyl', x: -5.5, y: -12, r: 2.4, h: 4, c: '#ffffff', z: 22.5 }, { t: 'horn', x: -5.5, y: -12, z: 26.5, name: 'horn' }] });
mod('relay', 'Relay module (1-ch)', 'Motors & actuators', '5 V relay, 10 A contacts, transistor driver with flyback diode. Most are active LOW.', 26, 34, '#1b5fbf',
  [['IN', 'di'], ['GND', 'gnd'], ['VCC', 'vcc']], { vmin: 4.5, vmax: 5.5, ma: 72, vih: 2.5, activeLow: true, drv: 'relay', out: 'relay', feats: [{ t: 'box', x: 0, y: -2, w: 19, d: 15.5, h: 15.5, c: '#2a6fd6', label: 'SRD-05VDC' }, { t: 'box', x: 0, y: -14, w: 15, d: 7.5, h: 10, c: '#2a8bd6', name: 'terminal' }, { t: 'led', x: 9, y: 12, c: '#ff2a2a', name: 'ind', small: true }] });
mod('l298n', 'DC motor + L298N driver', 'Motors & actuators', 'H-bridge with a geared DC motor. ENA (PWM) sets speed, IN1/IN2 set direction. Motor powered separately (7–12 V).', 43, 43, '#c21f1f',
  [['ENA', 'pwm'], ['IN1', 'di'], ['IN2', 'di'], ['GND', 'gnd'], ['5V', 'vcc']], { vmin: 4.5, vmax: 5.5, ma: 36, drv: 'l298n', out: 'motor', feats: [{ t: 'box', x: 0, y: -8, w: 23, d: 16, h: 25, c: '#1c1c1f', label: 'L298N' }, { t: 'box', x: 34, y: -6, w: 22, d: 19, h: 15, c: '#e0c64a', name: 'motorbody' }, { t: 'cyl', x: 50, y: -6, r: 10, h: 8, c: '#ffd23f', axis: 'x', name: 'wheel' }] });
mod('stepper', 'Stepper 28BYJ-48 + ULN2003', 'Motors & actuators', '5 V geared stepper, 2048 steps/rev, Darlington driver board.', 35, 32, '#2a8b3a',
  [['IN1', 'di'], ['IN2', 'di'], ['IN3', 'di'], ['IN4', 'di'], ['+', 'vcc'], ['-', 'gnd']], { vmin: 5, vmax: 5.5, ma: 240, drv: 'stepper', out: 'stepper', feats: [{ t: 'chip', x: -4, y: -4, w: 19, d: 6.4, h: 3, c: '#1c1c1f', label: 'ULN2003', dip: 16 }, { t: 'cyl', x: 40, y: -6, r: 14, h: 19, c: '#c9ccd1', metal: true }, { t: 'cyl', x: 40, y: -14, r: 1.5, h: 30, c: '#ffd23f', name: 'shaft' }] });
add('motor', 'DC motor (bare)', 'Motors & actuators', 'Toy DC motor. Never drive from a GPIO pin — use a transistor or a motor driver.', {
  w: 25, h: 20, pcb: null, header: 'term', pins: [{ n: '+', t: 'motor', x: -P, y: 12 }, { n: '-', t: 'motor', x: P, y: 12 }], ma: 250, out: 'motor', drv: 'none',
  feats: [{ t: 'cyl', x: 0, y: -2, r: 10, h: 25, c: '#c9ccd1', metal: true, axis: 'y', len: 25, name: 'motorbody' }, { t: 'cyl', x: 0, y: -17, r: 1, h: 10, c: '#d0d0d0', axis: 'y', len: 10, name: 'shaft' }],
});

// ── Communication & storage ────────────────────────────────────────────────
mod('hc05', 'HC-05 Bluetooth', 'Communication', 'Classic Bluetooth serial at 9600 baud. RX input is 3.3 V — divide a 5 V TX down.', 16, 37, '#1b5fbf',
  [['EN', 'nc'], ['VCC', 'vcc'], ['GND', 'gnd'], ['TXD', 'tx'], ['RXD', 'rx'], ['STATE', 'nc']], { vmin: 3.6, vmax: 6, ma: 40, outV: 3.3, inMax: 3.6, drv: 'hc05', feats: [{ t: 'box', x: 0, y: -5, w: 13, d: 27, h: 2.2, c: '#2a6fd6' }, { t: 'led', x: 5, y: 12, c: '#ff2a2a', small: true, blink: true }] });
mod('nrf24', 'nRF24L01+ radio', 'Communication', '2.4 GHz transceiver over SPI. 3.3 V supply only (logic pins are 5 V tolerant). Add 10 µF across VCC.', 15, 29, '#1f1f22',
  [['GND', 'gnd'], ['VCC', 'vcc'], ['CE', 'di'], ['CSN', 'cs'], ['SCK', 'sck'], ['MOSI', 'mosi'], ['MISO', 'miso'], ['IRQ', 'nc']], { vmin: 1.9, vmax: 3.6, ma: 14, drv: 'nrf24', feats: [{ t: 'chip', x: 0, y: 2, w: 4, d: 4, h: 0.9, c: '#1c1c1f' }, { t: 'traces', x: 0, y: -9, w: 12, d: 9, ant: true }] });
mod('sdcard', 'microSD card module', 'Communication', 'SPI microSD with level shifter and 3.3 V regulator. Logs readings to CSV.', 24, 42, '#1b5fbf',
  [['CS', 'cs'], ['SCK', 'sck'], ['MOSI', 'mosi'], ['MISO', 'miso'], ['VCC', 'vcc'], ['GND', 'gnd']], { vmin: 4.5, vmax: 5.5, ma: 80, drv: 'sdcard', outV: 3.3, feats: [{ t: 'box', x: 0, y: -8, w: 15, d: 15, h: 2, c: '#c9ccd1', metal: true }, { t: 'box', x: 0, y: -10, w: 11, d: 10, h: 2.4, c: '#1c1c1f', name: 'card' }] });
mod('ds3231', 'DS3231 real-time clock', 'Communication', 'Temperature-compensated RTC (±2 ppm) with coin-cell backup. I²C at 0x68.', 38, 22, '#1b5fbf',
  [['32K', 'nc'], ['SQW', 'nc'], ['SCL', 'scl'], ['SDA', 'sda'], ['VCC', 'vcc'], ['GND', 'gnd']], { vmin: 2.3, vmax: 5.5, ma: 0.2, i2c: 0x68, drv: 'ds3231', feats: [{ t: 'chip', x: -6, y: -2, w: 7.5, d: 10.3, h: 2.4, c: '#1c1c1f', label: 'DS3231' }, { t: 'cyl', x: 9, y: -2, r: 10, h: 3.2, c: '#c9ccd1', metal: true }], vals: [{ k: 'hour', l: 'Hour', u: 'h', min: 0, max: 23, v: 9, step: 1 }] });
mod('ads1115', 'ADS1115 16-bit ADC', 'Communication', 'Four analog inputs over I²C (0x48) — gives a Raspberry Pi analog channels.', 28, 18, '#7a3cbf',
  [['VDD', 'vcc'], ['GND', 'gnd'], ['SCL', 'scl'], ['SDA', 'sda'], ['ADDR', 'nc'], ['ALRT', 'nc'], ['A0', 'ain'], ['A1', 'ain'], ['A2', 'ain'], ['A3', 'ain']], { vmin: 2, vmax: 5.5, ma: 0.2, i2c: 0x48, drv: 'ads1115', adc: true, feats: [{ t: 'chip', x: 0, y: -3, w: 3, d: 3, h: 0.9, c: '#1c1c1f' }] });
mod('levelshift', 'Logic level shifter (4-ch)', 'Communication', 'Bi-directional BSS138 shifter between a 3.3 V (LV) and a 5 V (HV) side.', 15, 13, '#c21f1f',
  [['LV1', 'ls'], ['LV2', 'ls'], ['LV', 'lvref'], ['GND', 'gnd'], ['LV3', 'ls'], ['LV4', 'ls']], { vmin: 1.8, vmax: 5.5, ma: 0.1, drv: 'none', shifter: true, extraPins: [['HV1', 'hs'], ['HV2', 'hs'], ['HV', 'hvref'], ['GND', 'gnd'], ['HV3', 'hs'], ['HV4', 'hs']], feats: [{ t: 'chip', x: -3, y: 0, w: 2, d: 2, h: 0.8, c: '#1c1c1f' }, { t: 'chip', x: 3, y: 0, w: 2, d: 2, h: 0.8, c: '#1c1c1f' }] });

// ── Power & prototyping ────────────────────────────────────────────────────
add('bb830', 'Breadboard 830', 'Breadboards & power', 'Full-size solderless breadboard: 63 columns, two power rails per side.', { breadboard: 'full', w: 165.1, h: 54.6 });
add('bb400', 'Breadboard 400', 'Breadboards & power', 'Half-size breadboard: 30 columns, two power rails per side.', { breadboard: 'half', w: 82.6, h: 54.6 });
add('mb102', 'Breadboard power supply (MB102)', 'Breadboards & power', 'Plugs onto the end of a breadboard. Each side jumpers to 5 V or 3.3 V. 6.5–12 V DC in, ~700 mA.', {
  w: 33, h: 53, pcb: '#1b5fbf', header: 'rails', psu: true, ma: 700,
  pins: [{ n: 'T+', t: 'src', x: 0, y: -21.59, side: 'top' }, { n: 'T-', t: 'gnd', x: 0, y: -19.05 }, { n: 'B+', t: 'src', x: 0, y: 19.05, side: 'bottom' }, { n: 'B-', t: 'gnd', x: 0, y: 21.59 }],
  feats: [{ t: 'box', x: -8, y: 0, w: 14, d: 9, h: 11, c: '#1b1b1d', name: 'DC jack' }, { t: 'box', x: 8, y: -14, w: 8, d: 6, h: 3, c: '#c9ccd1', name: 'USB' }, { t: 'box', x: 8, y: 6, w: 6, d: 6, h: 6, c: '#e8e8e8', name: 'switch' }, { t: 'led', x: 0, y: 14, c: '#2bff5b', on: true }],
  props: { top: { l: 'Top rail', opts: ['5', '3.3'], def: '5', unit: 'V' }, bottom: { l: 'Bottom rail', opts: ['5', '3.3'], def: '3.3', unit: 'V' } },
});
add('bat9v', '9 V battery + clip', 'Breadboards & power', 'PP3 battery for VIN / barrel jack inputs (~500 mAh). Not for 5 V parts directly.', {
  w: 26.5, h: 48.5, pcb: null, header: 'term', battery: 9, ma: 500,
  pins: [{ n: '+', t: 'src', x: -P, y: 30 }, { n: '-', t: 'gnd', x: P, y: 30 }],
  feats: [{ t: 'box', x: 0, y: -2, w: 26.5, d: 46, h: 17.5, c: '#2a2a2c', label: '9V' }, { t: 'box', x: 0, y: -2, w: 26.6, d: 10, h: 17.6, c: '#ffd23f', z: 0 }],
});
add('aa4', '4 × AA battery pack', 'Breadboards & power', '6 V (alkaline) — fine for servos and motors, too high for 3.3 V parts.', {
  w: 62, h: 58, pcb: null, header: 'term', battery: 6, ma: 1000,
  pins: [{ n: '+', t: 'src', x: -P, y: 34 }, { n: '-', t: 'gnd', x: P, y: 34 }],
  feats: [{ t: 'box', x: 0, y: -2, w: 62, d: 58, h: 15, c: '#1f1f22' }, ...[0, 1, 2, 3].map((i) => ({ t: 'cyl', x: -22.5 + i * 15, y: -2, r: 7, h: 14, c: i % 2 ? '#c9ccd1' : '#2a2a2c', axis: 'y', len: 50, metal: true, z: 1 }))],
});

// Expand modules with extra pin rows (level shifter HV side on the opposite edge)
for (const d of D) {
  if (d.extraPins) d.pins.push(...hdr(d.extraPins, -d.h / 2 + 1.4));
  d.kind = d.breadboard ? 'breadboard' : 'part';
}
export const PARTS = Object.fromEntries(D.map((d) => [d.id, d]));
export const PART_CATS = ['Breadboards & power', 'Environment', 'Light & colour', 'Motion & position', 'Distance', 'Sound, touch & more', 'Inputs', 'Outputs', 'Motors & actuators', 'Communication', 'Passives'];
export const OHMS = { 100: 100, 220: 220, 330: 330, '1k': 1000, '4.7k': 4700, '10k': 10000, '100k': 100000 };
export { LED_COL };
