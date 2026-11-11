# Proto Lab

A 3D electronics prototyping bench in the browser. You place development boards, breadboards and sensor modules, wire them, and Proto Lab:

- checks the circuit like an electrical rules check
- simulates its behaviour
- writes starter firmware for it

## What's included

- **8 boards:**
  - Arduino Uno R3, Nano and Mega 2560
  - ESP32 DevKitC and NodeMCU ESP8266
  - Raspberry Pi Pico, Pi 5 and Pi Zero 2 W

  Each has its real pinout and pin functions: PWM, ADC, I²C, SPI, UART, interrupts, ESP32 strapping and input-only pins, and so on.
- **65 parts:**
  - **Sensors:** environment, light, motion, distance, sound, biometric and current.
  - **Inputs:** buttons, pots, joystick, encoder, RFID, IR, GPS.
  - **Outputs:** LEDs, RGB, buzzers, OLED, LCD, 7-segment, LED matrix, NeoPixels.
  - **Actuators:** servo, relay, DC motor driver, stepper.
  - **Radios and storage:** Bluetooth, nRF24, SD, RTC.
  - **Other:** ADS1115 ADC, level shifter, breadboards, an MB102 supply and batteries.
- **Breadboards:** 830 and 400 point. Parts dropped onto a breadboard plug into its holes, and the strips and rails connect them.
- **Wiring:** use the Wire tool on any pin or hole, or select a module and press **Auto-wire** to pick suitable pins.
- **Circuit check:** flags these problems:
  - shorts and mixed supplies
  - 3.3 V parts on 5 V
  - 5 V signals into 3.3 V GPIO
  - analog sensors on digital pins
  - wrong I²C, SPI or UART pins
  - ESP32 flash, ADC2 and strapping pins
  - LEDs without resistors, plus LED current
  - I²C address clashes
  - supply current budgets
  - missing common ground
  - motors driven straight from a GPIO pin
- **Simulation:** sliders and toggles act as sensors, and rules like "IF distance < 20 cm THEN buzzer on" drive the outputs. LEDs glow, servos turn, NeoPixels light, and displays show readings. A serial monitor prints what the firmware would print.
- **Code:** firmware is generated in three flavours:
  - Arduino C++ for AVR, ESP32, ESP8266 and Pico
  - MicroPython for Pico, ESP32 and ESP8266
  - Raspberry Pi Python using gpiozero and CircuitPython/Blinka

  The output includes library lists, wiring comments and your rules.
- **Examples:**
  - parking sensor (Nano)
  - blink and button (Uno)
  - weather station
  - smart plant (ESP32)
  - motion light (Pi 5 + ADS1115)
  - NeoPixel thermometer (Pico)
  - fault-finding challenge

Run it locally:

```bash
python3 -m http.server 8000      # from this folder
# open http://localhost:8000/#ex=parking
```

Deep links:

- `#ex=<example>` opens an example.
- `#d=<…>` holds a whole design; it is created by the **Link** button.

Designs autosave in the browser and can be saved and opened as JSON.

The pin data follows the manufacturers' published pinouts. The electrical checks and the simulation are behavioural teaching aids, not SPICE. Check the generated code and wiring against the datasheets before connecting real hardware.

Docs: `docs/projects/proto-lab/`.
