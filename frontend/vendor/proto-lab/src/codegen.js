/**
 * Firmware generator. Reads the analysed circuit and writes a complete starter program:
 *   arduino      Arduino C++ (Uno, Nano, Mega, ESP32, ESP8266, Pico with arduino-pico)
 *   micropython  MicroPython (Pico, ESP32, ESP8266)
 *   python       Raspberry Pi Python 3 (gpiozero + Adafruit Blinka / CircuitPython libraries)
 * Every reading becomes a variable; rules and displays use those variables.
 */
import { BOARDS, label } from './catalog/boards.js';
import { defOf, mainBoard, picoI2C } from './circuit.js';

export const LANGS = { arduino: 'Arduino C++', micropython: 'MicroPython', python: 'Python (Raspberry Pi)' };
export const langsFor = (fam) => ({ 'arduino-avr': ['arduino'], esp32: ['arduino', 'micropython'], esp8266: ['arduino', 'micropython'], pico: ['micropython', 'arduino'], rpi: ['python'] }[fam] || ['arduino']);
const NODEMCU = { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, RX: 3, TX: 1, A0: 0 };
const ascii = (s) => String(s).replace(/°C/g, 'C').replace(/°/g, 'deg').replace(/²/g, '2').replace(/₂/g, '2').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');

/** Variables a sensor exposes given how it is wired (shared with the simulator and rule editor). */
export function sensorVars(def, C) {
  if (!def.vals) return [];
  if (def.digitalFrom) {
    const ao = def.pins.find((p) => p.t === 'ao'), dout = def.pins.find((p) => p.t === 'do');
    if (C && !C.pins[ao.n] && dout && C.pins[dout.n]) return [{ k: `${def.digitalFrom.k}_det`, l: `${def.vals[0].l} alarm`, bool: true, from: def.digitalFrom }];
  }
  if (def.id === 'max30102') return def.vals.slice(0, 1);
  return def.vals;
}
/** What a rule can do to an output. */
export const ACTIONS = {
  led: [['on', 'turn on'], ['blink', 'blink']], rgb: [['color', 'show colour']], buzzer: [['on', 'sound']], relay: [['on', 'switch on']],
  servo: [['angle', 'move to angle']], motor: [['speed', 'run at speed']], stepper: [['on', 'rotate']], neopixel: [['color', 'show colour']],
};

// ── Drivers ────────────────────────────────────────────────────────────────
// Each returns { inc, glob, setup, read, vars, act(kind,arg), show(list), loop, libs } for the current language.
const D = {};
const R = (c, k, expr) => (c.L === 'arduino' ? `float ${c.n}_${k} = ${expr};` : `${c.n}_${k} = ${expr}`);
const B = (c, k, expr) => (c.L === 'arduino' ? `bool ${c.n}_${k} = ${expr};` : `${c.n}_${k} = ${expr}`);

D.dht = (c) => {
  const t = c.def.dhtType;
  if (c.L === 'arduino') return { inc: ['#include <DHT.h>'], glob: [`DHT ${c.n}(${c.pin('DATA')}, ${t});`], setup: [`${c.n}.begin();`], read: [R(c, 'temp', `${c.n}.readTemperature()`), R(c, 'hum', `${c.n}.readHumidity()`)], libs: ['DHT sensor library (Adafruit)'] };
  if (c.L === 'micropython') return { inc: ['import dht'], glob: [`${c.n} = dht.${t}(Pin(${c.num('DATA')}))`], read: [`${c.n}.measure()`, R(c, 'temp', `${c.n}.temperature()`), R(c, 'hum', `${c.n}.humidity()`)] };
  return { inc: ['import adafruit_dht'], glob: [`${c.n} = adafruit_dht.${t}(board.D${c.num('DATA')})`], read: [R(c, 'temp', `${c.n}.temperature`), R(c, 'hum', `${c.n}.humidity`)], libs: ['adafruit-circuitpython-dht'] };
};
D.bme280 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_BME280.h>'], glob: [`Adafruit_BME280 ${c.n};`], setup: [`if (!${c.n}.begin(${c.hex})) Serial.println("${c.n}: BME280 not found");`], read: [R(c, 'temp', `${c.n}.readTemperature()`), R(c, 'hum', `${c.n}.readHumidity()`), R(c, 'pres', `${c.n}.readPressure() / 100.0F`)], libs: ['Adafruit BME280 Library'] };
  if (c.L === 'micropython') return { inc: ['import bme280_float as bme280  # driver: bme280_float.py'], glob: [`${c.n} = bme280.BME280(i2c=i2c, address=${c.hex})`], read: [`${c.n}_temp, ${c.n}_pres, ${c.n}_hum = ${c.n}.read_compensated_data()`, `${c.n}_pres /= 100`] };
  return { inc: ['from adafruit_bme280 import basic as adafruit_bme280'], glob: [`${c.n} = adafruit_bme280.Adafruit_BME280_I2C(i2c, address=${c.hex})`], read: [R(c, 'temp', `${c.n}.temperature`), R(c, 'hum', `${c.n}.relative_humidity`), R(c, 'pres', `${c.n}.pressure`)], libs: ['adafruit-circuitpython-bme280'] };
};
D.bmp280 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_BMP280.h>'], glob: [`Adafruit_BMP280 ${c.n};`], setup: [`if (!${c.n}.begin(${c.hex})) Serial.println("${c.n}: BMP280 not found");`], read: [R(c, 'temp', `${c.n}.readTemperature()`), R(c, 'pres', `${c.n}.readPressure() / 100.0F`)], libs: ['Adafruit BMP280 Library'] };
  if (c.L === 'micropython') return { inc: ['from bmp280 import BMP280  # driver: bmp280.py'], glob: [`${c.n} = BMP280(i2c, addr=${c.hex})`], read: [R(c, 'temp', `${c.n}.temperature`), R(c, 'pres', `${c.n}.pressure / 100`)] };
  return { inc: ['import adafruit_bmp280'], glob: [`${c.n} = adafruit_bmp280.Adafruit_BMP280_I2C(i2c, address=${c.hex})`], read: [R(c, 'temp', `${c.n}.temperature`), R(c, 'pres', `${c.n}.pressure`)], libs: ['adafruit-circuitpython-bmp280'] };
};
D.sht31 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_SHT31.h>'], glob: [`Adafruit_SHT31 ${c.n};`], setup: [`${c.n}.begin(${c.hex});`], read: [R(c, 'temp', `${c.n}.readTemperature()`), R(c, 'hum', `${c.n}.readHumidity()`)], libs: ['Adafruit SHT31 Library'] };
  if (c.L === 'micropython') return { inc: ['import sht31  # driver: sht31.py'], glob: [`${c.n} = sht31.SHT31(i2c, addr=${c.hex})`], read: [`${c.n}_temp, ${c.n}_hum = ${c.n}.get_temp_humi()`] };
  return { inc: ['import adafruit_sht31d'], glob: [`${c.n} = adafruit_sht31d.SHT31D(i2c)`], read: [R(c, 'temp', `${c.n}.temperature`), R(c, 'hum', `${c.n}.relative_humidity`)], libs: ['adafruit-circuitpython-sht31d'] };
};
D.ds18b20 = (c) => {
  if (c.L === 'arduino') return { inc: ['#include <OneWire.h>', '#include <DallasTemperature.h>'], glob: [`OneWire ${c.n}_bus(${c.pin('DATA')});`, `DallasTemperature ${c.n}(&${c.n}_bus);`], setup: [`${c.n}.begin();`], read: [`${c.n}.requestTemperatures();`, R(c, 'temp', `${c.n}.getTempCByIndex(0)`)], libs: ['OneWire', 'DallasTemperature'] };
  if (c.L === 'micropython') return { inc: ['import onewire, ds18x20'], glob: [`${c.n} = ds18x20.DS18X20(onewire.OneWire(Pin(${c.num('DATA')})))`, `${c.n}_roms = ${c.n}.scan()`], read: [`${c.n}.convert_temp()`, 'time.sleep_ms(750)', R(c, 'temp', `${c.n}.read_temp(${c.n}_roms[0])`)] };
  return { inc: ['from w1thermsensor import W1ThermSensor'], glob: [`${c.n} = W1ThermSensor()  # enable 1-Wire: dtoverlay=w1-gpio,gpiopin=${c.num('DATA')}`], read: [R(c, 'temp', `${c.n}.get_temperature()`)], libs: ['w1thermsensor'] };
};
function analogRead(c, pinName, lo, hi) {
  const m = c.map(pinName);
  if (m?.ads) {
    const a = c.adsName(m.ads);
    if (c.L === 'arduino') return `mapf(${a}.computeVolts(${a}.readADC_SingleEnded(${m.ch})), 0, ${c.vcc}, ${lo}, ${hi})`;
    if (c.L === 'micropython') return `mapf(${a}.raw_to_v(${a}.read(4, ${m.ch})), 0, ${c.vcc}, ${lo}, ${hi})`;
    return `mapf(AnalogIn(${a}, ADS.P${m.ch}).voltage, 0, ${c.vcc}, ${lo}, ${hi})`;
  }
  if (c.L === 'arduino') return `mapf(analogRead(${c.pin(pinName)}), 0, ${c.adcMax}, ${lo}, ${hi})`;
  if (c.L === 'micropython') return `mapf(${c.n}_${pinName.toLowerCase()}.read_u16(), 0, 65535, ${lo}, ${hi})`;
  return '0  # the Raspberry Pi has no ADC: wire this to an ADS1115';
}
function adcGlob(c, pinName) {
  const m = c.map(pinName);
  if (m?.ads || c.L !== 'micropython') return [];
  const g = c.num(pinName), v = `${c.n}_${pinName.toLowerCase()}`;
  if (c.fam === 'esp8266') return [`${v} = ADC(0)`];
  if (c.fam === 'esp32') return [`${v} = ADC(Pin(${g}), atten=ADC.ATTN_11DB)`];
  return [`${v} = ADC(Pin(${g}))`];
}
function digitalIn(c, pinName, k, activeLow, pull) {
  const lvl = activeLow ? 'LOW' : 'HIGH';
  if (c.L === 'arduino') return { setup: [`pinMode(${c.pin(pinName)}, ${pull ? 'INPUT_PULLUP' : 'INPUT'});`], read: [B(c, k, `digitalRead(${c.pin(pinName)}) == ${lvl}`)] };
  const v = `${c.n}_${pinName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  if (c.L === 'micropython') return { glob: [`${v} = Pin(${c.num(pinName)}, Pin.IN${pull ? ', Pin.PULL_UP' : ''})`], read: [B(c, k, `${v}.value() == ${activeLow ? 0 : 1}`)] };
  c.gz('DigitalInputDevice');
  return { glob: [`${v} = DigitalInputDevice(${c.num(pinName)}, pull_up=${pull ? 'True' : 'None'}${pull ? '' : `, active_state=${activeLow ? 'False' : 'True'}`})`], read: [B(c, k, `${v}.is_active`)] };
}
D.analog = (c) => {
  const v = c.def.vals[0], ao = c.def.pins.find((p) => p.t === 'ao'), dout = c.def.pins.find((p) => p.t === 'do');
  c.needMap();
  if (c.map(ao.n)) {
    const lo = c.def.id === 'soil' ? v.max : v.min, hi = c.def.id === 'soil' ? v.min : v.max;
    return { glob: adcGlob(c, ao.n), read: [R(c, v.k, analogRead(c, ao.n, lo, hi)) + (c.L === 'arduino' ? '  // calibrate' : '  # calibrate')] };
  }
  if (dout && c.map(dout.n)) {
    const f = c.def.digitalFrom; const activeLow = c.def.activeLow ?? true;
    return digitalIn(c, dout.n, `${f.k}_det`, activeLow, false);
  }
  return {};
};
D.digital = (c) => {
  const p = c.def.pins.find((x) => x.t === 'do'), k = c.def.vals[0].k;
  if (c.L === 'python' && c.def.id === 'pir') { c.gz('MotionSensor'); return { glob: [`${c.n} = MotionSensor(${c.num(p.n)})`], read: [B(c, k, `${c.n}.motion_detected`)] }; }
  return digitalIn(c, p.n, k, !!c.def.activeLow, !!c.def.activeLow);
};
D.button = (c) => {
  const pull = c.C.mode !== 'pulldown';
  if (c.L === 'python') { c.gz('Button'); return { glob: [`${c.n} = Button(${c.num('SIG')}${pull ? '' : ', pull_up=False'})`], read: [B(c, 'press', `${c.n}.is_pressed`)] }; }
  return digitalIn(c, 'SIG', 'press', pull, pull);
};
D.bh1750 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <BH1750.h>'], glob: [`BH1750 ${c.n};`], setup: [`${c.n}.begin();`], read: [R(c, 'lux', `${c.n}.readLightLevel()`)], libs: ['BH1750 (Christopher Laws)'] };
  if (c.L === 'micropython') return { setup: [`i2c.writeto(${c.hex}, b'\\x10')  # continuous high-res mode`], read: [R(c, 'lux', `int.from_bytes(i2c.readfrom(${c.hex}, 2), 'big') / 1.2`)] };
  return { inc: ['import adafruit_bh1750'], glob: [`${c.n} = adafruit_bh1750.BH1750(i2c)`], read: [R(c, 'lux', `${c.n}.lux`)], libs: ['adafruit-circuitpython-bh1750'] };
};
D.tcs34725 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_TCS34725.h>'], glob: [`Adafruit_TCS34725 ${c.n}(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);`], setup: [`${c.n}.begin();`], read: [`float ${c.n}_r, ${c.n}_g, ${c.n}_b;`, `${c.n}.getRGB(&${c.n}_r, &${c.n}_g, &${c.n}_b);`], libs: ['Adafruit TCS34725'] };
  if (c.L === 'micropython') return { inc: ['import tcs34725  # driver: tcs34725.py'], glob: [`${c.n} = tcs34725.TCS34725(i2c)`], read: [`${c.n}_r, ${c.n}_g, ${c.n}_b = tcs34725.html_rgb(${c.n}.read(True))`] };
  return { inc: ['import adafruit_tcs34725'], glob: [`${c.n} = adafruit_tcs34725.TCS34725(i2c)`], read: [`${c.n}_r, ${c.n}_g, ${c.n}_b = ${c.n}.color_rgb_bytes`], libs: ['adafruit-circuitpython-tcs34725'] };
};
D.mpu6050 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_MPU6050.h>'], glob: [`Adafruit_MPU6050 ${c.n};`], setup: [`if (!${c.n}.begin(${c.hex})) Serial.println("${c.n}: MPU6050 not found");`], read: [`sensors_event_t ${c.n}_a, ${c.n}_g, ${c.n}_t;`, `${c.n}.getEvent(&${c.n}_a, &${c.n}_g, &${c.n}_t);`, R(c, 'ax', `${c.n}_a.acceleration.x`), R(c, 'ay', `${c.n}_a.acceleration.y`), R(c, 'az', `${c.n}_a.acceleration.z`)], libs: ['Adafruit MPU6050'] };
  if (c.L === 'micropython') return { inc: ['from imu import MPU6050  # driver: micropython-IMU'], glob: [`${c.n} = MPU6050(i2c)`], read: [R(c, 'ax', `${c.n}.accel.x * 9.81`), R(c, 'ay', `${c.n}.accel.y * 9.81`), R(c, 'az', `${c.n}.accel.z * 9.81`)] };
  return { inc: ['import adafruit_mpu6050'], glob: [`${c.n} = adafruit_mpu6050.MPU6050(i2c)`], read: [`${c.n}_ax, ${c.n}_ay, ${c.n}_az = ${c.n}.acceleration`], libs: ['adafruit-circuitpython-mpu6050'] };
};
D.adxl345 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_ADXL345_U.h>'], glob: [`Adafruit_ADXL345_Unified ${c.n}(12345);`], setup: [`${c.n}.begin();`], read: [`sensors_event_t ${c.n}_e; ${c.n}.getEvent(&${c.n}_e);`, R(c, 'ax', `${c.n}_e.acceleration.x`), R(c, 'ay', `${c.n}_e.acceleration.y`), R(c, 'az', `${c.n}_e.acceleration.z`)], libs: ['Adafruit ADXL345'] };
  if (c.L === 'micropython') return { setup: [`i2c.writeto_mem(${c.hex}, 0x2D, b'\\x08')  # measure mode`], read: ['import struct', `${c.n}_ax, ${c.n}_ay, ${c.n}_az = [v * 0.0383 for v in struct.unpack('<hhh', i2c.readfrom_mem(${c.hex}, 0x32, 6))]`] };
  return { inc: ['import adafruit_adxl34x'], glob: [`${c.n} = adafruit_adxl34x.ADXL345(i2c)`], read: [`${c.n}_ax, ${c.n}_ay, ${c.n}_az = ${c.n}.acceleration`], libs: ['adafruit-circuitpython-adxl34x'] };
};
D.encoder = (c) => {
  if (c.L === 'arduino') return { glob: [`long ${c.n}_count = 0; int ${c.n}_last;`], setup: [`pinMode(${c.pin('CLK')}, INPUT); pinMode(${c.pin('DT')}, INPUT); pinMode(${c.pin('SW')}, INPUT_PULLUP);`, `${c.n}_last = digitalRead(${c.pin('CLK')});`], read: [`int ${c.n}_clk = digitalRead(${c.pin('CLK')});`, `if (${c.n}_clk != ${c.n}_last && ${c.n}_clk == LOW) ${c.n}_count += digitalRead(${c.pin('DT')}) != ${c.n}_clk ? 1 : -1;`, `${c.n}_last = ${c.n}_clk;`, R(c, 'pos', `${c.n}_count`), B(c, 'press', `digitalRead(${c.pin('SW')}) == LOW`)] };
  if (c.L === 'micropython') return { glob: [`${c.n}_clk = Pin(${c.num('CLK')}, Pin.IN)`, `${c.n}_dt = Pin(${c.num('DT')}, Pin.IN)`, `${c.n}_sw = Pin(${c.num('SW')}, Pin.IN, Pin.PULL_UP)`, `${c.n}_pos = 0`, `def ${c.n}_turn(p):`, `    global ${c.n}_pos`, `    ${c.n}_pos += 1 if ${c.n}_dt.value() != p.value() else -1`, `${c.n}_clk.irq(${c.n}_turn, Pin.IRQ_FALLING)`], read: [B(c, 'press', `${c.n}_sw.value() == 0`)] };
  c.gz('RotaryEncoder'); c.gz('Button');
  return { glob: [`${c.n} = RotaryEncoder(${c.num('CLK')}, ${c.num('DT')}, max_steps=0)`, `${c.n}_sw = Button(${c.num('SW')})`], read: [R(c, 'pos', `${c.n}.steps`), B(c, 'press', `${c.n}_sw.is_pressed`)] };
};
D.hcsr04 = (c) => {
  if (c.L === 'arduino') return { setup: [`pinMode(${c.pin('TRIG')}, OUTPUT); pinMode(${c.pin('ECHO')}, INPUT);`], read: [`digitalWrite(${c.pin('TRIG')}, LOW); delayMicroseconds(2);`, `digitalWrite(${c.pin('TRIG')}, HIGH); delayMicroseconds(10); digitalWrite(${c.pin('TRIG')}, LOW);`, R(c, 'dist', `pulseIn(${c.pin('ECHO')}, HIGH, 30000) / 58.0`) + '  // cm'] };
  if (c.L === 'micropython') return { inc: ['from machine import time_pulse_us'], glob: [`${c.n}_trig = Pin(${c.num('TRIG')}, Pin.OUT)`, `${c.n}_echo = Pin(${c.num('ECHO')}, Pin.IN)`], read: [`${c.n}_trig.value(0); time.sleep_us(2); ${c.n}_trig.value(1); time.sleep_us(10); ${c.n}_trig.value(0)`, R(c, 'dist', `time_pulse_us(${c.n}_echo, 1, 30000) / 58`)] };
  c.gz('DistanceSensor');
  return { glob: [`${c.n} = DistanceSensor(echo=${c.num('ECHO')}, trigger=${c.num('TRIG')}, max_distance=4)`], read: [R(c, 'dist', `${c.n}.distance * 100`)] };
};
D.vl53l0x = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_VL53L0X.h>'], glob: [`Adafruit_VL53L0X ${c.n};`], setup: [`${c.n}.begin();`], read: [`VL53L0X_RangingMeasurementData_t ${c.n}_m; ${c.n}.rangingTest(&${c.n}_m, false);`, R(c, 'mm', `${c.n}_m.RangeMilliMeter`)], libs: ['Adafruit_VL53L0X'] };
  if (c.L === 'micropython') return { inc: ['from vl53l0x import VL53L0X  # driver: vl53l0x.py'], glob: [`${c.n} = VL53L0X(i2c)`, `${c.n}.start()`], read: [R(c, 'mm', `${c.n}.read()`)] };
  return { inc: ['import adafruit_vl53l0x'], glob: [`${c.n} = adafruit_vl53l0x.VL53L0X(i2c)`], read: [R(c, 'mm', `${c.n}.range`)], libs: ['adafruit-circuitpython-vl53l0x'] };
};
D.max30102 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <MAX30105.h>', '#include <heartRate.h>'], glob: [`MAX30105 ${c.n};`, `float ${c.n}_beat = 0; unsigned long ${c.n}_lastBeat = 0;`], setup: [`${c.n}.begin(Wire, I2C_SPEED_FAST);`, `${c.n}.setup();`], read: [`long ${c.n}_ir = ${c.n}.getIR();`, `if (checkForBeat(${c.n}_ir)) { ${c.n}_beat = 60000.0 / (millis() - ${c.n}_lastBeat); ${c.n}_lastBeat = millis(); }`, R(c, 'bpm', `${c.n}_beat`)], libs: ['SparkFun MAX3010x Pulse and Proximity Sensor Library'] };
  if (c.L === 'micropython') return { inc: ['from max30102 import MAX30102  # driver: max30102 (n-elia)'], glob: [`${c.n} = MAX30102(i2c=i2c)`, `${c.n}.setup_sensor()`, `${c.n}_bpm = 0`], read: [`${c.n}.check()`, `# feed ${c.n}.pop_ir_from_storage() into a beat detector to update ${c.n}_bpm`] };
  return { inc: ['from heartrate_monitor import HeartRateMonitor  # max30102 + hrcalc'], glob: [`${c.n} = HeartRateMonitor()`, `${c.n}.start_sensor()`], read: [R(c, 'bpm', `${c.n}.bpm`)] };
};
D.hx711 = (c) => {
  if (c.L === 'arduino') return { inc: ['#include <HX711.h>'], glob: [`HX711 ${c.n};`], setup: [`${c.n}.begin(${c.pin('DT')}, ${c.pin('SCK')});`, `${c.n}.set_scale(420.0);  // calibrate with a known weight`, `${c.n}.tare();`], read: [R(c, 'grams', `${c.n}.get_units(5)`)], libs: ['HX711 (Bogdan Necula)'] };
  if (c.L === 'micropython') return { inc: ['from hx711 import HX711  # driver: hx711.py'], glob: [`${c.n} = HX711(d_out=Pin(${c.num('DT')}), pd_sck=Pin(${c.num('SCK')}))`, `${c.n}_zero = ${c.n}.read()`], read: [R(c, 'grams', `(${c.n}.read() - ${c.n}_zero) / 420.0`)] };
  return { inc: ['from hx711 import HX711  # pip: hx711'], glob: [`${c.n} = HX711(dout_pin=${c.num('DT')}, pd_sck_pin=${c.num('SCK')})`, `${c.n}.zero()`], read: [R(c, 'grams', `${c.n}.get_data_mean(5) / 420.0`)] };
};
D.ina219 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_INA219.h>'], glob: [`Adafruit_INA219 ${c.n}(${c.hex});`], setup: [`${c.n}.begin();`], read: [R(c, 'ma', `${c.n}.getCurrent_mA()`), R(c, 'volts', `${c.n}.getBusVoltage_V()`)], libs: ['Adafruit INA219'] };
  if (c.L === 'micropython') return { inc: ['from ina219 import INA219  # driver: pyb_ina219'], glob: [`${c.n} = INA219(0.1, i2c)`, `${c.n}.configure()`], read: [R(c, 'ma', `${c.n}.current()`), R(c, 'volts', `${c.n}.voltage()`)] };
  return { inc: ['import adafruit_ina219'], glob: [`${c.n} = adafruit_ina219.INA219(i2c)`], read: [R(c, 'ma', `${c.n}.current`), R(c, 'volts', `${c.n}.bus_voltage`)], libs: ['adafruit-circuitpython-ina219'] };
};
D.joystick = (c) => {
  c.needMap();
  const btn = c.map('SW') ? digitalIn(c, 'SW', 'press', true, true) : {};
  return { glob: [...adcGlob(c, 'VRX'), ...adcGlob(c, 'VRY'), ...(btn.glob || [])], setup: btn.setup, read: [R(c, 'x', analogRead(c, 'VRX', -100, 100)), R(c, 'y', analogRead(c, 'VRY', -100, 100)), ...(btn.read || [])] };
};
D.rc522 = (c) => {
  c.spi();
  if (c.L === 'arduino') return { inc: ['#include <MFRC522.h>'], glob: [`MFRC522 ${c.n}(${c.pin('SDA')}, ${c.pin('RST')});`], setup: [`${c.n}.PCD_Init();`], read: [B(c, 'card', `${c.n}.PICC_IsNewCardPresent() && ${c.n}.PICC_ReadCardSerial()`)], libs: ['MFRC522 (miguelbalboa)'] };
  if (c.L === 'micropython') return { inc: ['from mfrc522 import MFRC522  # driver: micropython-mfrc522'], glob: [`${c.n} = MFRC522(spi, gpioRst=Pin(${c.num('RST')}), gpioCs=Pin(${c.num('SDA')}))`], read: [`(${c.n}_st, _) = ${c.n}.request(${c.n}.REQIDL)`, B(c, 'card', `${c.n}_st == ${c.n}.OK`)] };
  return { inc: ['from mfrc522 import SimpleMFRC522'], glob: [`${c.n} = SimpleMFRC522()  # uses SPI0 CE0 and GPIO25 for RST`], read: [B(c, 'card', `${c.n}.read_id_no_block() is not None`)], libs: ['mfrc522'] };
};
D.irrecv = (c) => {
  if (c.L === 'arduino') return { inc: ['#include <IRremote.hpp>'], setup: [`IrReceiver.begin(${c.pin('OUT')});`], read: [`int ${c.n}_code = 0;`, `if (IrReceiver.decode()) { ${c.n}_code = IrReceiver.decodedIRData.command; IrReceiver.resume(); }`], libs: ['IRremote'] };
  if (c.L === 'micropython') return { inc: ['from ir_rx.nec import NEC_8  # driver: micropython_ir'], glob: [`${c.n}_code = 0`, `def ${c.n}_cb(data, addr, ctrl):`, `    global ${c.n}_code`, `    if data >= 0: ${c.n}_code = data`, `${c.n} = NEC_8(Pin(${c.num('OUT')}, Pin.IN), ${c.n}_cb)`] };
  return { glob: [`${c.n}_code = 0  # enable dtoverlay=gpio-ir,gpio_pin=${c.num('OUT')} and read keys with evdev`] };
};
D.gps = (c) => {
  const rx = c.pin('TX'), tx = c.pin('RX');   // board RX ← module TX
  if (c.L === 'arduino') {
    const ser = c.fam === 'esp32' ? 'Serial2' : c.fam === 'pico' ? 'Serial2' : `${c.n}_ser`;
    const glob = [`TinyGPSPlus ${c.n};`]; const setup = [];
    if (c.fam === 'esp32') setup.push(`Serial2.begin(9600, SERIAL_8N1, ${rx}, ${tx});`);
    else if (c.fam === 'pico') setup.push(`Serial2.setRX(${rx}); Serial2.setTX(${tx}); Serial2.begin(9600);`);
    else { glob.unshift(`SoftwareSerial ${c.n}_ser(${rx}, ${tx});`); setup.push(`${c.n}_ser.begin(9600);`); }
    return { inc: ['#include <TinyGPSPlus.h>', ...(c.fam === 'esp32' || c.fam === 'pico' ? [] : ['#include <SoftwareSerial.h>'])], glob, setup, read: [`while (${ser}.available()) ${c.n}.encode(${ser}.read());`, R(c, 'lat', `${c.n}.location.lat()`), R(c, 'lon', `${c.n}.location.lng()`)], libs: ['TinyGPSPlus'] };
  }
  if (c.L === 'micropython') return { inc: ['from micropyGPS import MicropyGPS  # driver: micropyGPS.py'], glob: [`${c.n}_uart = UART(1, 9600, tx=Pin(${c.num('RX')}), rx=Pin(${c.num('TX')}))`, `${c.n} = MicropyGPS(location_formatting='dd')`], read: [`for b in (${c.n}_uart.read() or b''): ${c.n}.update(chr(b))`, R(c, 'lat', `${c.n}.latitude[0]`), R(c, 'lon', `${c.n}.longitude[0]`)] };
  return { inc: ['import serial, pynmea2'], glob: [`${c.n}_ser = serial.Serial('/dev/serial0', 9600, timeout=0.5)`, `${c.n}_lat = ${c.n}_lon = 0`], read: [`${c.n}_line = ${c.n}_ser.readline().decode(errors='ignore')`, `if ${c.n}_line.startswith('$GPGGA'):`, `    ${c.n}_msg = pynmea2.parse(${c.n}_line); ${c.n}_lat, ${c.n}_lon = ${c.n}_msg.latitude, ${c.n}_msg.longitude`], libs: ['pyserial', 'pynmea2'] };
};
// outputs
function digitalOut(c, pinName, activeLow) {
  const on = activeLow ? 'LOW' : 'HIGH', off = activeLow ? 'HIGH' : 'LOW';
  if (c.L === 'arduino') return { setup: [`pinMode(${c.pin(pinName)}, OUTPUT);`, `digitalWrite(${c.pin(pinName)}, ${off});`], act: (k) => (k === 'blink' ? `digitalWrite(${c.pin(pinName)}, (millis() / 500) % 2 ? ${on} : ${off});` : `digitalWrite(${c.pin(pinName)}, ${k === 'off' ? off : on});`) };
  if (c.L === 'micropython') return { glob: [`${c.n} = Pin(${c.num(pinName)}, Pin.OUT, value=${activeLow ? 1 : 0})`], act: (k) => (k === 'blink' ? `${c.n}.value(${activeLow ? 1 : 0} ^ (time.ticks_ms() // 500) % 2)` : `${c.n}.value(${(k === 'off') !== !!activeLow ? 0 : 1})`) };
  c.gz(c.def.out === 'buzzer' ? 'Buzzer' : c.def.out === 'led' ? 'LED' : 'OutputDevice');
  const cls = c.def.out === 'buzzer' ? 'Buzzer' : c.def.out === 'led' ? 'LED' : 'OutputDevice';
  return { glob: [`${c.n} = ${cls}(${c.num(pinName)}${cls === 'OutputDevice' ? `, active_high=${activeLow ? 'False' : 'True'}, initial_value=False` : ''})`], act: (k) => (k === 'blink' ? `${c.n}.value = int(time.time() * 2) % 2` : `${c.n}.${k === 'off' ? 'off' : 'on'}()`) };
}
D.led = (c) => (c.map('A')?.p ? digitalOut(c, 'A', false) : { note: 'always on (wired to a supply)' });
D.buzzer = (c) => digitalOut(c, 'I/O', false);
D.relay = (c) => digitalOut(c, 'IN', true);
D.piezo = (c) => {
  if (c.L === 'arduino') return { act: (k) => (k === 'off' ? `noTone(${c.pin('S')});` : `tone(${c.pin('S')}, 880);`) };
  if (c.L === 'micropython') return { glob: [`${c.n} = PWM(Pin(${c.num('S')}), freq=880, duty_u16=0)`], act: (k) => `${c.n}.duty_u16(${k === 'off' ? 0 : 32768})` };
  c.gz('TonalBuzzer');
  return { glob: [`${c.n} = TonalBuzzer(${c.num('S')})`], act: (k) => (k === 'off' ? `${c.n}.stop()` : `${c.n}.play('A5')`) };
};
D.rgb = (c) => {
  const ch = ['R', 'G', 'B'].filter((x) => c.map(x)?.p);
  const col = (arg) => hex(arg || '#ff0000');
  if (c.L === 'arduino') return { setup: ch.map((x) => `pinMode(${c.pin(x)}, OUTPUT);`), act: (k, arg) => { const v = k === 'off' ? [0, 0, 0] : k === 'cycle' ? null : col(arg); return v ? ch.map((x) => `analogWrite(${c.pin(x)}, ${v['RGB'.indexOf(x)]});`).join(' ') : ch.map((x, i) => `analogWrite(${c.pin(x)}, (sin(millis() / 600.0 + ${i * 2.1}) + 1) * 127);`).join(' '); } };
  if (c.L === 'micropython') return { inc: ['import math'], glob: ch.map((x) => `${c.n}_${x.toLowerCase()} = PWM(Pin(${c.num(x)}), freq=1000)`), act: (k, arg) => { const v = k === 'off' ? [0, 0, 0] : k === 'cycle' ? null : col(arg); return v ? ch.map((x) => `${c.n}_${x.toLowerCase()}.duty_u16(${v['RGB'.indexOf(x)] * 257})`).join('; ') : ch.map((x, i) => `${c.n}_${x.toLowerCase()}.duty_u16(int((math.sin(time.ticks_ms() / 600 + ${i * 2.1}) + 1) * 32767))`).join('; '); } };
  c.gz('RGBLED');
  return { inc: ['import math'], glob: [`${c.n} = RGBLED(red=${c.num('R')}, green=${c.num('G')}, blue=${c.num('B')})`], act: (k, arg) => { const v = k === 'off' ? [0, 0, 0] : k === 'cycle' ? null : col(arg); return v ? `${c.n}.color = (${v.map((x) => +(x / 255).toFixed(2)).join(', ')})` : `${c.n}.color = tuple((math.sin(time.time() * 1.7 + i * 2.1) + 1) / 2 for i in range(3))`; } };
};
D.servo = (c) => {
  if (c.L === 'arduino') return { inc: [c.fam === 'esp32' ? '#include <ESP32Servo.h>' : '#include <Servo.h>'], glob: [`Servo ${c.n};`], setup: [`${c.n}.attach(${c.pin('PWM')});`], act: (k, arg) => (k === 'sweep' ? `${c.n}.write(abs((int)((millis() / 15) % 360) - 180));` : `${c.n}.write(${k === 'off' ? 0 : +arg || 90});`), libs: [c.fam === 'esp32' ? 'ESP32Servo' : 'Servo (built in)'] };
  if (c.L === 'micropython') return { glob: [`${c.n} = PWM(Pin(${c.num('PWM')}), freq=50)`, `def ${c.n}_write(angle):`, `    ${c.n}.duty_u16(int(1638 + angle / 180 * 6554))`], act: (k, arg) => (k === 'sweep' ? `${c.n}_write(abs(time.ticks_ms() // 15 % 360 - 180))` : `${c.n}_write(${k === 'off' ? 0 : +arg || 90})`) };
  c.gz('AngularServo');
  return { glob: [`${c.n} = AngularServo(${c.num('PWM')}, min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)`], act: (k, arg) => (k === 'sweep' ? `${c.n}.angle = abs(int(time.time() * 66) % 360 - 180)` : `${c.n}.angle = ${k === 'off' ? 0 : +arg || 90}`) };
};
D.l298n = (c) => {
  if (c.L === 'arduino') return { setup: [`pinMode(${c.pin('ENA')}, OUTPUT); pinMode(${c.pin('IN1')}, OUTPUT); pinMode(${c.pin('IN2')}, OUTPUT);`], act: (k, arg) => (k === 'off' ? `analogWrite(${c.pin('ENA')}, 0);` : `digitalWrite(${c.pin('IN1')}, HIGH); digitalWrite(${c.pin('IN2')}, LOW); analogWrite(${c.pin('ENA')}, ${Math.round(((+arg || 60) / 100) * 255)});`) };
  if (c.L === 'micropython') return { glob: [`${c.n}_en = PWM(Pin(${c.num('ENA')}), freq=1000, duty_u16=0)`, `${c.n}_in1 = Pin(${c.num('IN1')}, Pin.OUT, value=1)`, `${c.n}_in2 = Pin(${c.num('IN2')}, Pin.OUT, value=0)`], act: (k, arg) => `${c.n}_en.duty_u16(${k === 'off' ? 0 : Math.round(((+arg || 60) / 100) * 65535)})` };
  c.gz('Motor');
  return { glob: [`${c.n} = Motor(forward=${c.num('IN1')}, backward=${c.num('IN2')}, enable=${c.num('ENA')})`], act: (k, arg) => (k === 'off' ? `${c.n}.stop()` : `${c.n}.forward(${((+arg || 60) / 100).toFixed(2)})`) };
};
D.stepper = (c) => {
  const ins = ['IN1', 'IN2', 'IN3', 'IN4'];
  if (c.L === 'arduino') return { inc: ['#include <Stepper.h>'], glob: [`Stepper ${c.n}(2048, ${c.pin('IN1')}, ${c.pin('IN3')}, ${c.pin('IN2')}, ${c.pin('IN4')});`], setup: [`${c.n}.setSpeed(12);  // rpm`], act: (k) => (k === 'off' ? '' : `${c.n}.step(64);`), libs: ['Stepper (built in)'] };
  const seq = '[[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,1,1],[0,0,0,1],[1,0,0,1]]';
  if (c.L === 'micropython') return { glob: [`${c.n}_pins = [${ins.map((x) => `Pin(${c.num(x)}, Pin.OUT)`).join(', ')}]`, `${c.n}_seq = ${seq}`, `def ${c.n}_step(n):`, `    for i in range(n):`, `        for p, v in zip(${c.n}_pins, ${c.n}_seq[i % 8]): p.value(v)`, `        time.sleep_ms(2)`], act: (k) => (k === 'off' ? 'pass' : `${c.n}_step(64)`) };
  c.gz('OutputDevice');
  return { glob: [`${c.n}_pins = [${ins.map((x) => `OutputDevice(${c.num(x)})`).join(', ')}]`, `${c.n}_seq = ${seq}`, `def ${c.n}_step(n):`, `    for i in range(n):`, `        for p, v in zip(${c.n}_pins, ${c.n}_seq[i % 8]): p.value = v`, `        time.sleep(0.002)`], act: (k) => (k === 'off' ? 'pass' : `${c.n}_step(64)`) };
};
D.neopixel = (c) => {
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_NeoPixel.h>'], glob: [`Adafruit_NeoPixel ${c.n}(12, ${c.pin('DIN')}, NEO_GRB + NEO_KHZ800);`], setup: [`${c.n}.begin();`, `${c.n}.setBrightness(60);`], act: (k, arg) => { if (k === 'rainbow') return `${c.n}.rainbow(millis() * 20); ${c.n}.show();`; const v = k === 'off' ? [0, 0, 0] : hex(arg || '#00a0ff'); return `${c.n}.fill(${c.n}.Color(${v.join(', ')})); ${c.n}.show();`; }, libs: ['Adafruit NeoPixel'] };
  if (c.L === 'micropython') return { inc: ['import neopixel'], glob: [`${c.n} = neopixel.NeoPixel(Pin(${c.num('DIN')}), 12)`, `def ${c.n}_wheel(i, t):`, `    h = (i * 21 + t // 10) % 256`, `    return (255 - h, h, 0) if h < 128 else (0, 255 - h, h)`], act: (k, arg) => { if (k === 'rainbow') return `${c.n}.fill((0, 0, 0)); [${c.n}.__setitem__(i, ${c.n}_wheel(i, time.ticks_ms())) for i in range(12)]; ${c.n}.write()`; const v = k === 'off' ? [0, 0, 0] : hex(arg || '#00a0ff').map((x) => Math.round(x * 0.25)); return `${c.n}.fill((${v.join(', ')})); ${c.n}.write()`; } };
  return { inc: ['import neopixel'], glob: [`${c.n} = neopixel.NeoPixel(board.D${c.num('DIN')}, 12, brightness=0.25)  # needs GPIO 10, 12, 18 or 21 and sudo`], act: (k, arg) => { if (k === 'rainbow') return `${c.n}[:] = [((i * 21 + int(time.time() * 100)) % 256, 80, 255 - (i * 21) % 256) for i in range(12)]`; const v = k === 'off' ? [0, 0, 0] : hex(arg || '#00a0ff'); return `${c.n}.fill((${v.join(', ')}))`; }, libs: ['adafruit-circuitpython-neopixel'] };
};
function showLines(c, list, perLine) { return list.slice(0, perLine).map((v) => ({ l: ascii(v.l).slice(0, 10), v: v.v, u: ascii(v.u || ''), bool: v.bool })); }
D.oled = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_SSD1306.h>'], glob: [`Adafruit_SSD1306 ${c.n}(128, 64, &Wire, -1);`], setup: [`${c.n}.begin(SSD1306_SWITCHCAPVCC, ${c.hex});`, `${c.n}.setTextColor(SSD1306_WHITE);`], show: (list) => [`${c.n}.clearDisplay(); ${c.n}.setTextSize(1); ${c.n}.setCursor(0, 0);`, `${c.n}.println("Proto Lab");`, ...showLines(c, list, 5).map((x) => `${c.n}.print("${x.l}: "); ${c.n}.print(${x.v}${x.bool ? ' ? "yes" : "no"' : ', 1'}); ${c.n}.println("${x.u ? ` ${x.u}` : ''}");`), `${c.n}.display();`], libs: ['Adafruit SSD1306', 'Adafruit GFX Library'] };
  if (c.L === 'micropython') return { inc: ['import ssd1306  # driver: ssd1306.py'], glob: [`${c.n} = ssd1306.SSD1306_I2C(128, 64, i2c, addr=${c.hex})`], show: (list) => [`${c.n}.fill(0)`, `${c.n}.text('Proto Lab', 0, 0)`, ...showLines(c, list, 5).map((x, i) => `${c.n}.text('${x.l}: ' + ${x.bool ? `('yes' if ${x.v} else 'no')` : `'{:.1f}'.format(${x.v})`} + '${x.u ? ` ${x.u}` : ''}', 0, ${12 + i * 10})`), `${c.n}.show()`] };
  return { inc: ['from luma.core.interface.serial import i2c as luma_i2c', 'from luma.core.render import canvas', 'from luma.oled.device import ssd1306'], glob: [`${c.n} = ssd1306(luma_i2c(port=1, address=${c.hex}))`], show: (list) => [`with canvas(${c.n}) as draw:`, `    draw.text((0, 0), 'Proto Lab', fill='white')`, ...showLines(c, list, 5).map((x, i) => `    draw.text((0, ${12 + i * 10}), f"${x.l}: {${x.bool ? `'yes' if ${x.v} else 'no'` : `${x.v}:.1f`}}${x.u ? ` ${x.u}` : ''}", fill='white')`)], libs: ['luma.oled'] };
};
D.lcd = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <LiquidCrystal_I2C.h>'], glob: [`LiquidCrystal_I2C ${c.n}(${c.hex}, 16, 2);`], setup: [`${c.n}.init();`, `${c.n}.backlight();`], show: (list) => { const L = showLines(c, list, 2); return L.length ? [`${c.n}.clear();`, ...L.map((x, i) => `${c.n}.setCursor(0, ${i}); ${c.n}.print("${x.l.slice(0, 7)} "); ${c.n}.print(${x.v}${x.bool ? ' ? "yes" : "no"' : ', 1'}); ${c.n}.print("${x.u.slice(0, 3)}");`)] : [`${c.n}.setCursor(0, 0); ${c.n}.print("Proto Lab");`]; }, libs: ['LiquidCrystal I2C'] };
  if (c.L === 'micropython') return { inc: ['from i2c_lcd import I2cLcd  # driver: python_lcd'], glob: [`${c.n} = I2cLcd(i2c, ${c.hex}, 2, 16)`], show: (list) => { const L = showLines(c, list, 2); return [`${c.n}.clear()`, ...L.map((x, i) => `${c.n}.move_to(0, ${i}); ${c.n}.putstr('${x.l.slice(0, 7)} ' + ${x.bool ? `('yes' if ${x.v} else 'no')` : `'{:.1f}'.format(${x.v})`} + '${x.u.slice(0, 3)}')`)]; } };
  return { inc: ['from RPLCD.i2c import CharLCD'], glob: [`${c.n} = CharLCD('PCF8574', ${c.hex}, cols=16, rows=2)`], show: (list) => { const L = showLines(c, list, 2); return [`${c.n}.clear()`, ...L.map((x, i) => `${c.n}.cursor_pos = (${i}, 0); ${c.n}.write_string(f"${x.l.slice(0, 7)} {${x.bool ? `'yes' if ${x.v} else 'no'` : `${x.v}:.1f`}}${x.u.slice(0, 3)}")`)]; }, libs: ['RPLCD', 'smbus2'] };
};
D.tm1637 = (c) => {
  const first = (list) => list.find((x) => !x.bool);
  if (c.L === 'arduino') return { inc: ['#include <TM1637Display.h>'], glob: [`TM1637Display ${c.n}(${c.pin('CLK')}, ${c.pin('DIO')});`], setup: [`${c.n}.setBrightness(5);`], show: (list) => [first(list) ? `${c.n}.showNumberDec((int)${first(list).v});` : `${c.n}.showNumberDecEx((millis() / 1000) % 10000, 0x40);`], libs: ['TM1637 (Avishay Orpaz)'] };
  if (c.L === 'micropython') return { inc: ['import tm1637  # driver: micropython-tm1637'], glob: [`${c.n} = tm1637.TM1637(clk=Pin(${c.num('CLK')}), dio=Pin(${c.num('DIO')}))`], show: (list) => [`${c.n}.number(int(${first(list)?.v ?? 'time.ticks_ms() // 1000'}))`] };
  return { inc: ['import tm1637  # pip: raspberrypi-tm1637'], glob: [`${c.n} = tm1637.TM1637(clk=${c.num('CLK')}, dio=${c.num('DIO')})`], show: (list) => [`${c.n}.number(int(${first(list)?.v ?? 'time.time()'}))`] };
};
D.max7219 = (c) => {
  const lvl = (list) => { const x = list.find((v) => !v.bool); return x ? { v: x.v, lo: x.min ?? 0, hi: x.max ?? 100 } : null; };
  if (c.L === 'arduino') return { inc: ['#include <LedControl.h>'], glob: [`LedControl ${c.n}(${c.pin('DIN')}, ${c.pin('CLK')}, ${c.pin('CS')}, 1);`], setup: [`${c.n}.shutdown(0, false); ${c.n}.setIntensity(0, 4);`], show: (list) => { const x = lvl(list); return [`int ${c.n}_h = ${x ? `constrain(map(${x.v}, ${x.lo}, ${x.hi}, 0, 8), 0, 8)` : '(millis() / 200) % 9'};`, `for (int r = 0; r < 8; r++) ${c.n}.setRow(0, r, r >= 8 - ${c.n}_h ? 0xFF : 0x00);`]; }, libs: ['LedControl'] };
  if (c.L === 'micropython') return { inc: ['import max7219  # driver: micropython-max7219'], glob: [`${c.n} = max7219.Matrix8x8(spi, Pin(${c.num('CS')}), 1)`], show: (list) => { const x = lvl(list); return [`${c.n}_h = ${x ? `max(0, min(8, int((${x.v} - ${x.lo}) / ${x.hi - x.lo} * 8)))` : 'time.ticks_ms() // 200 % 9'}`, `${c.n}.fill(0); ${c.n}.fill_rect(0, 8 - ${c.n}_h, 8, ${c.n}_h, 1); ${c.n}.show()`]; } };
  return { inc: ['from luma.led_matrix.device import max7219', 'from luma.core.interface.serial import spi as luma_spi, noop', 'from luma.core.render import canvas'], glob: [`${c.n} = max7219(luma_spi(port=0, device=0, gpio=noop()))`], show: (list) => { const x = lvl(list); return [`${c.n}_h = ${x ? `max(0, min(8, int((${x.v} - ${x.lo}) / ${x.hi - x.lo} * 8)))` : 'int(time.time() * 5) % 9'}`, `with canvas(${c.n}) as draw:`, `    draw.rectangle((0, 8 - ${c.n}_h, 7, 7), fill='white')`]; }, libs: ['luma.led_matrix'] };
};
D.hc05 = (c) => {
  const rx = c.pin('TXD'), tx = c.pin('RXD');
  if (c.L === 'arduino') {
    if (c.fam === 'esp32') return { setup: [`Serial2.begin(9600, SERIAL_8N1, ${rx}, ${tx});`], send: (s) => `Serial2.println(${s});` };
    return { inc: ['#include <SoftwareSerial.h>'], glob: [`SoftwareSerial ${c.n}(${rx}, ${tx});`], setup: [`${c.n}.begin(9600);`], send: (s) => `${c.n}.println(${s});` };
  }
  if (c.L === 'micropython') return { glob: [`${c.n} = UART(1, 9600, tx=Pin(${c.num('RXD')}), rx=Pin(${c.num('TXD')}))`], send: (s) => `${c.n}.write(${s} + '\\n')` };
  return { inc: ['import serial'], glob: [`${c.n} = serial.Serial('/dev/serial0', 9600)`], send: (s) => `${c.n}.write((${s} + '\\n').encode())`, libs: ['pyserial'] };
};
D.nrf24 = (c) => {
  c.spi();
  if (c.L === 'arduino') return { inc: ['#include <RF24.h>'], glob: [`RF24 ${c.n}(${c.pin('CE')}, ${c.pin('CSN')});`, `const byte ${c.n}_addr[6] = "PLAB1";`], setup: [`${c.n}.begin(); ${c.n}.openWritingPipe(${c.n}_addr); ${c.n}.stopListening();`], send: (s) => `${c.n}.write(${s}.c_str(), min((int)${s}.length(), 32));`, libs: ['RF24'] };
  if (c.L === 'micropython') return { inc: ['from nrf24l01 import NRF24L01  # driver: nrf24l01.py'], glob: [`${c.n} = NRF24L01(spi, Pin(${c.num('CSN')}), Pin(${c.num('CE')}), payload_size=32)`, `${c.n}.open_tx_pipe(b'PLAB1')`], send: (s) => `${c.n}.send(${s}.encode()[:32])` };
  return { inc: ['from pyrf24 import RF24, RF24_PA_LOW'], glob: [`${c.n} = RF24(${c.num('CE')}, 0)`, `${c.n}.begin(); ${c.n}.open_tx_pipe(b'PLAB1')`], send: (s) => `${c.n}.write(${s}.encode()[:32])`, libs: ['pyrf24'] };
};
D.sdcard = (c) => {
  c.spi();
  if (c.L === 'arduino') return { inc: ['#include <SD.h>'], setup: [`if (!SD.begin(${c.pin('CS')})) Serial.println("SD card not found");`], send: (s) => `File ${c.n}_f = SD.open("/log.csv", FILE_APPEND); if (${c.n}_f) { ${c.n}_f.println(${s}); ${c.n}_f.close(); }`, libs: ['SD (built in)'] };
  if (c.L === 'micropython') return { inc: ['import os, sdcard  # driver: sdcard.py'], glob: [`os.mount(os.VfsFat(sdcard.SDCard(spi, Pin(${c.num('CS')}))), '/sd')`], send: (s) => `open('/sd/log.csv', 'a').write(${s} + '\\n')` };
  return { send: (s) => `open('log.csv', 'a').write(${s} + '\\n')  # the Pi logs to its own storage` };
};
D.ds3231 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <RTClib.h>'], glob: [`RTC_DS3231 ${c.n};`], setup: [`${c.n}.begin();`, `if (${c.n}.lostPower()) ${c.n}.adjust(DateTime(F(__DATE__), F(__TIME__)));`], read: [R(c, 'hour', `${c.n}.now().hour()`)], libs: ['RTClib'] };
  if (c.L === 'micropython') return { inc: ['from ds3231 import DS3231  # driver: ds3231_port.py'], glob: [`${c.n} = DS3231(i2c)`], read: [R(c, 'hour', `${c.n}.get_time()[3]`)] };
  return { inc: ['import adafruit_ds3231'], glob: [`${c.n} = adafruit_ds3231.DS3231(i2c)`], read: [R(c, 'hour', `${c.n}.datetime.tm_hour`)], libs: ['adafruit-circuitpython-ds3231'] };
};
D.ads1115 = (c) => {
  c.i2c();
  if (c.L === 'arduino') return { inc: ['#include <Adafruit_ADS1X15.h>'], glob: [`Adafruit_ADS1115 ${c.n};`], setup: [`${c.n}.begin(${c.hex});`], libs: ['Adafruit ADS1X15'] };
  if (c.L === 'micropython') return { inc: ['from ads1x15 import ADS1115  # driver: ads1x15.py'], glob: [`${c.n} = ADS1115(i2c, ${c.hex}, 1)`] };
  return { inc: ['import adafruit_ads1x15.ads1115 as ADS', 'from adafruit_ads1x15.analog_in import AnalogIn'], glob: [`${c.n} = ADS.ADS1115(i2c, address=${c.hex})`], libs: ['adafruit-circuitpython-ads1x15'] };
};
D.none = () => ({});
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ── Program assembly ───────────────────────────────────────────────────────
export function instanceNames(A) {
  const names = new Map(), count = {};
  for (const it of A.doc.items) {
    const def = defOf(it); if (def?.kind !== 'part' || def.breadboard || def.psu || def.battery || def.passive) continue;
    const base = def.id.replace(/[^a-z0-9]/gi, '');
    count[base] = (count[base] || 0) + 1;
    names.set(it.uid, `${base}_${count[base]}`);
  }
  return names;
}

export function generate(A, lang) {
  const main = mainBoard(A);
  if (!main) return { code: '// Add a board to generate code.', file: 'sketch.ino', libs: [] };
  const bd = BOARDS[main.type], fam = bd.family;
  const L = langsFor(fam).includes(lang) ? lang : langsFor(fam)[0];
  const names = instanceNames(A);
  const parts = A.doc.items.filter((it) => names.has(it.uid) && A.conn.get(it.uid)?.main);
  const inc = new Set(), glob = [], setup = [], read = [], libs = new Set(), notes = [], gz = new Set();
  let useI2C = false, useSPI = false, useMap = false;
  const drivers = new Map();
  const i2cPins = {}, spiPins = {};
  const adcMax = { 'arduino-avr': 1023, esp32: 4095, esp8266: 1023, pico: 1023 }[fam] || 1023;
  for (const it of parts) {
    const def = defOf(it), C = A.conn.get(it.uid), n = names.get(it.uid);
    const m = (pn) => C.pins[pn];
    for (const p of def.pins) { const b = m(p.n); if (b?.p && (p.t === 'sda' || p.t === 'scl')) i2cPins[p.t] = b.p; if (b?.p && ['mosi', 'miso', 'sck'].includes(p.t)) spiPins[p.t] = b.p; }
    const c = {
      L, fam, n, def, it, C, adcMax, vcc: C.v || bd.logic,
      hex: def.i2c ? `0x${def.i2c.toString(16).toUpperCase().padStart(2, '0')}` : '',
      map: m,
      pin: (pn) => { const b = m(pn); return b?.p ? armPin(b.p, fam) : `/* ${pn}? */ -1`; },
      num: (pn) => { const b = m(pn); return b?.p ? gpioNum(b.p, fam) : `None  # ${pn} not wired`; },
      adsName: (uid) => names.get(uid),
      i2c: () => { useI2C = true; }, spi: () => { useSPI = true; }, needMap: () => { useMap = true; }, gz: (x) => gz.add(x),
    };
    const drv = (D[def.drv] || D.none)(c);
    drivers.set(it.uid, { c, drv, def, n, it, C });
  }
  const vars = [];
  for (const { drv, def, n, C, it } of drivers.values()) {
    (drv.inc || []).forEach((x) => inc.add(x));
    glob.push(...(drv.glob || [])); setup.push(...(drv.setup || []));
    if (drv.read?.length) read.push(`${L === 'arduino' ? '//' : '#'} ${def.name}`, ...drv.read);
    (drv.libs || []).forEach((x) => libs.add(x));
    if (drv.read?.length) for (const v of sensorVars(def, C)) vars.push({ ...v, v: `${n}_${v.k}`, uid: it.uid, n });
  }
  // rules
  const rules = (A.doc.rules || []).filter((r) => drivers.has(r.dst) && vars.some((v) => `${v.uid}.${v.k}` === r.src));
  const ruled = new Set(rules.map((r) => r.dst));
  const ctl = [];
  const cmt = L === 'arduino' ? '//' : '#';
  for (const r of rules) {
    const v = vars.find((x) => `${x.uid}.${x.k}` === r.src), d = drivers.get(r.dst);
    if (!d.drv.act) continue;
    const cond = v.bool ? (r.op === 'is' && !+r.val ? (L === 'arduino' ? `!${v.v}` : `not ${v.v}`) : v.v) : `${v.v} ${r.op === '<' ? '<' : '>'} ${+r.val}`;
    const on = d.drv.act(r.act || 'on', r.arg), off = d.drv.act('off');
    ctl.push(`${cmt} rule: when ${ascii(v.l)} ${v.bool ? (r.op === 'is' && !+r.val ? 'is off' : 'is on') : `${r.op} ${r.val}`} -> ${d.n} ${r.act}${r.arg ? ` ${r.arg}` : ''}`);
    if (L === 'arduino') ctl.push(`if (${cond}) { ${on} } else { ${off} }`);
    else ctl.push(`if ${cond}:`, `    ${on}`, 'else:', `    ${off}`);
  }
  // default behaviours for outputs without rules
  for (const d of drivers.values()) {
    if (!d.drv.act || ruled.has(d.it.uid)) continue;
    const dflt = { led: 'blink', servo: 'sweep', neopixel: 'rainbow', rgb: 'cycle', stepper: 'on', motor: 'speed', buzzer: 'off', relay: 'off' }[d.def.out];
    if (!dflt) continue;
    const line = d.drv.act(dflt, dflt === 'speed' ? 60 : undefined);
    if (line) ctl.push(`${cmt} ${d.n}: ${dflt === 'off' ? 'idle (add a rule to control it)' : `default demo (${dflt})`}`, line);
  }
  // displays & senders
  const show = [];
  for (const d of drivers.values()) if (d.drv.show) show.push(`${cmt} ${d.def.name}`, ...d.drv.show(vars));
  const csv = vars.length ? vars : null;
  for (const d of drivers.values()) if (d.drv.send && csv) {
    const expr = L === 'arduino' ? `String(${csv.map((v) => v.v).join(') + "," + String(')})` : `','.join(str(x) for x in (${csv.map((v) => v.v).join(', ')},))`;
    show.push(`${cmt} ${d.def.name}: send readings as CSV`, ...(L === 'arduino' ? [`{ String line = ${expr}; ${d.drv.send('line')} }`] : [`line = ${expr}`, d.drv.send('line')]));
  }
  // assemble
  const title = `Proto Lab — ${bd.name}`;
  const pinLines = [];
  for (const d of drivers.values()) {
    const ps = Object.entries(d.C.pins).filter(([, b]) => b?.p).map(([k, b]) => `${k}→${label(b.n)}`);
    if (ps.length) pinLines.push(`${d.n} (${d.def.name}): ${ps.join(', ')}`);
  }
  let code;
  if (L === 'arduino') code = assembleArduino({ title, bd, fam, inc, glob, setup, read, vars, ctl, show, useI2C, useSPI, useMap, i2cPins, libs, pinLines });
  else if (L === 'micropython') code = assembleMicro({ title, bd, fam, inc, glob, setup, read, vars, ctl, show, useI2C, useSPI, useMap, i2cPins, spiPins, pinLines });
  else code = assemblePi({ title, bd, inc, glob, setup, read, vars, ctl, show, useI2C, useSPI, useMap, gz, libs, pinLines });
  if (!parts.length) notes.push('Wire a sensor or module to the board to generate its code.');
  return { code, lang: L, file: L === 'arduino' ? 'proto_lab.ino' : L === 'micropython' ? 'main.py' : 'proto_lab.py', libs: [...libs], notes, vars };
}

function armPin(p, fam) {
  if (fam === 'arduino-avr') return /^\d+$/.test(p.code) ? p.code : p.code;  // 13 or A0
  if (fam === 'esp8266') return p.code;   // D4 / A0 are defined by the NodeMCU core
  return p.code;
}
function gpioNum(p, fam) { return fam === 'esp8266' ? NODEMCU[p.code] ?? p.code : p.code; }
const header = (c, title, pinLines, extra = []) => [c + ' ' + title, c + ' Generated by Proto Lab. Check pins and libraries before uploading.', ...extra.map((x) => `${c} ${x}`), ...(pinLines.length ? [c + ' Wiring:', ...pinLines.map((x) => `${c}   ${ascii(x.replace(/→/g, '->'))}`)] : [])];
const ind = (lines, s = '  ') => lines.filter((x) => x !== undefined).map((x) => (x ? s + x : x));

function assembleArduino(o) {
  const out = header('//', o.title, o.pinLines, o.libs.size ? [`Libraries (Library Manager): ${[...o.libs].join(', ')}`] : []);
  out.push('');
  if (o.useI2C) out.push('#include <Wire.h>');
  if (o.useSPI) out.push('#include <SPI.h>');
  out.push(...o.inc, '');
  if (o.glob.length) out.push(...o.glob, '');
  if (o.useMap) out.push('float mapf(float x, float inLo, float inHi, float outLo, float outHi) {', '  return outLo + (x - inLo) * (outHi - outLo) / (inHi - inLo);', '}', '');
  out.push('void setup() {', '  Serial.begin(115200);');
  if (o.useI2C) out.push(o.fam === 'esp32' && o.i2cPins.sda && o.i2cPins.scl ? `  Wire.begin(${o.i2cPins.sda.code}, ${o.i2cPins.scl.code});` : o.fam === 'pico' && o.i2cPins.sda ? `  Wire${picoI2C(+o.i2cPins.sda.code) ? '1' : ''}.setSDA(${o.i2cPins.sda.code}); Wire${picoI2C(+o.i2cPins.sda.code) ? '1' : ''}.setSCL(${o.i2cPins.scl.code}); Wire.begin();` : '  Wire.begin();');
  if (o.useSPI) out.push('  SPI.begin();');
  if (o.fam === 'esp32' || o.fam === 'pico') out.push('  analogReadResolution(' + (o.fam === 'esp32' ? 12 : 10) + ');');
  out.push(...ind(o.setup), '}', '', 'void loop() {', ...ind(o.read));
  if (o.vars.length) {
    out.push('', '  // serial monitor (115200 baud)');
    o.vars.forEach((v, i) => out.push(`  Serial.print("${i ? '  ' : ''}${v.n}.${v.k}="); Serial.print(${v.v});`));
    out.push('  Serial.println();');
  }
  if (o.ctl.length) out.push('', ...ind(o.ctl));
  if (o.show.length) out.push('', ...ind(o.show));
  out.push('', '  delay(200);', '}', '');
  return out.join('\n');
}
function assembleMicro(o) {
  const out = header('#', o.title, o.pinLines, ['Copy any driver files named below to the board (Thonny or mpremote).']);
  const m = ['Pin'];
  const usesAdc = o.glob.some((g) => g.includes('ADC(')), usesPwm = o.glob.some((g) => g.includes('PWM(')), usesUart = o.glob.some((g) => g.includes('UART('));
  if (usesAdc) m.push('ADC'); if (usesPwm) m.push('PWM'); if (usesUart) m.push('UART');
  if (o.useI2C) m.push(o.fam === 'esp8266' ? 'SoftI2C' : 'I2C'); if (o.useSPI) m.push('SPI');
  out.push('', `from machine import ${m.join(', ')}`, 'import time', ...o.inc, '');
  if (o.useI2C) {
    const s = o.i2cPins.sda, c = o.i2cPins.scl;
    const sda = s ? gpioNum(s, o.fam) : o.fam === 'pico' ? 4 : 21, scl = c ? gpioNum(c, o.fam) : o.fam === 'pico' ? 5 : 22;
    out.push(o.fam === 'esp8266' ? `i2c = SoftI2C(scl=Pin(${scl}), sda=Pin(${sda}))` : `i2c = I2C(${o.fam === 'pico' ? picoI2C(+sda) : 0}, sda=Pin(${sda}), scl=Pin(${scl}), freq=400000)`);
    out.push('print("I2C devices:", [hex(a) for a in i2c.scan()])');
  }
  if (o.useSPI) {
    const k = o.spiPins;
    out.push(o.fam === 'pico' ? `spi = SPI(${k.sck && [10, 14, 26].includes(+k.sck.code) ? 1 : 0}, baudrate=1000000, sck=Pin(${k.sck?.code ?? 18}), mosi=Pin(${k.mosi?.code ?? 19}), miso=Pin(${k.miso?.code ?? 16}))` : o.fam === 'esp8266' ? 'spi = SPI(1, baudrate=1000000)' : `spi = SPI(2, baudrate=1000000, sck=Pin(${k.sck?.code ?? 18}), mosi=Pin(${k.mosi?.code ?? 23}), miso=Pin(${k.miso?.code ?? 19}))`);
  }
  if (o.useMap) out.push('', 'def mapf(x, in_lo, in_hi, out_lo, out_hi):', '    return out_lo + (x - in_lo) * (out_hi - out_lo) / (in_hi - in_lo)');
  out.push('', ...o.glob, ...o.setup);
  if (o.vars.length) out.push('', ...o.vars.map((v) => `${v.v} = 0`));
  out.push('', 'while True:');
  if (o.read.length) out.push('    try:', ...ind(o.read, '        '), '    except OSError as e:', "        print('sensor error:', e)");
  if (o.vars.length) out.push('', `    print(${o.vars.map((v) => `'${v.n}.${v.k}=', ${v.v}`).join(', ')})`);
  if (o.ctl.length) out.push('', ...ind(o.ctl, '    '));
  if (o.show.length) out.push('', ...ind(o.show, '    '));
  out.push('', '    time.sleep_ms(200)', '');
  return out.join('\n');
}
function assemblePi(o) {
  const out = header('#', o.title, o.pinLines, ['Run with: python3 proto_lab.py   (pins use BCM GPIO numbers)', ...(o.libs.size ? [`pip install ${[...o.libs].join(' ')}`] : []), ...(o.useI2C ? ['Enable I2C with sudo raspi-config.'] : []), ...(o.useSPI ? ['Enable SPI with sudo raspi-config.'] : [])]);
  out.push('', 'import time');
  if (o.gz.size) out.push(`from gpiozero import ${[...o.gz].sort().join(', ')}`);
  const needBoard = o.useI2C || o.useSPI || o.glob.some((g) => g.includes('board.'));
  if (needBoard) out.push('import board' + (o.useI2C || o.useSPI ? ', busio' : ''));
  out.push(...o.inc, '');
  if (o.useI2C) out.push('i2c = busio.I2C(board.SCL, board.SDA)');
  if (o.useSPI) out.push('spi = busio.SPI(board.SCK, MOSI=board.MOSI, MISO=board.MISO)');
  if (o.useMap) out.push('', 'def mapf(x, in_lo, in_hi, out_lo, out_hi):', '    return out_lo + (x - in_lo) * (out_hi - out_lo) / (in_hi - in_lo)');
  out.push('', ...o.glob, ...o.setup);
  if (o.vars.length) out.push('', ...o.vars.map((v) => `${v.v} = 0`));
  out.push('', 'while True:');
  if (o.read.length) out.push('    try:', ...ind(o.read, '        '), '    except (OSError, RuntimeError) as e:', "        print('sensor error:', e)");
  if (o.vars.length) out.push('', `    print(${o.vars.map((v) => `'${v.n}.${v.k}=', ${v.v}`).join(', ')})`);
  if (o.ctl.length) out.push('', ...ind(o.ctl, '    '));
  if (o.show.length) out.push('', ...ind(o.show, '    '));
  out.push('', '    time.sleep(0.2)', '');
  return out.join('\n');
}
