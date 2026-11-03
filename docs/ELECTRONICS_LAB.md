# Electronics lab

The native `/lab/electronics` page is an original, limited recreation of useful learning interactions observed on https://learn-arduino-red.vercel.app/. No code, 3D models, lesson text or branding from that site is bundled. Its publicly served HTML and entry bundle were inspected; no source map or reuse licence was found in that entry bundle. This is not a recovered copy of the original project or its 16-lesson course.

The first module uses ShowOnce's existing original procedural ESP32, resistor and LED models. It supports orbit/zoom/reset, keyboard-accessible component selection, four guided stages, an illustrative blink animation, and a text alternative when WebGL is unavailable. The circuit connectors depict a conceptual series path rather than exact pins or breadboard holes. It is not an electrical or firmware simulator.

Electronics-related published lessons offer `Explore in 3D`. The lab returns to that lesson; otherwise it returns to the lesson library. It never marks a lesson checkpoint complete and does not send lab illustrations as learner evidence. Existing imported ESP32 assets and their required credits elsewhere in the application are unchanged.

Next scope: instructor-approved board and connection metadata, precise pin/row mapping, additional tested circuits, and a real circuit/firmware simulation engine if needed. None of these are claimed by this module.

## Verification

Frontend tests (13) and production build passed. Browser checks with test-only API fixtures passed lesson-to-lab navigation, direct links, component selection, guided stages, blink controls, view reset, lesson return, mobile overflow and WebGL fallback. Desktop (1440px) and mobile (390px) screenshots were visually reviewed. These checks do not establish electrical or AI accuracy.

Run Vite, then `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node scripts/browser-lab.cjs`. Optional `BASE_URL` selects another local server. Screenshots are written to ignored `artifacts/ui`.
