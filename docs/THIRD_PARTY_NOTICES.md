# Component catalogue and viewer

## Interface typography

Nunito variable font is bundled from the official Google Fonts repository at https://github.com/google/fonts/tree/main/ofl/nunito. It is licensed under the SIL Open Font License 1.1; the complete licence is included at `frontend/src/assets/fonts/OFL.txt`. Nunito provides the rounded typography inspired by the user's references; it is not claimed to be Duolingo's proprietary font.

## Imported ESP32 Wroom model

“ESP32 Wroom” by **TER1Z**, source: https://sketchfab.com/3d-models/esp32-wroom-fd714190aacc4e3f9c26b8d7e27807fc, author: https://sketchfab.com/TER1Z. Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**: https://creativecommons.org/licenses/by/4.0/ . Licence verified via Sketchfab's public model API on 13 October 2026.

The owner supplied ESP32_Wroom.usdz, bundled at frontend/src/assets/models/ESP32_Wroom.usdz. The original archive is unchanged. ShowOnce rotates, centres and uniformly scales the scene for display, and hides its silk-screen/text meshes in the generic preview to avoid exposing unconfirmed pin identities. No endorsement by the author is implied. Visible attribution and licence links appear beside the viewer.

The supplied geometry has 19 header contacts per side (38 total), so it is used as a generic visual reference, not as the confirmed devkit-v1-30 board. The separate 30-pin reference remains responsible for that variant's pin highlighting. The asset's dimensions and lettering are not evidence about the user's physical board, pinout or continuity.

The five historical procedural 3D reference models in `frontend/src/component-models.ts` are original ShowOnce code. The generic ESP32 preview now uses the attributed model above; the nominal 30-pin reference and other procedural components remain. No Relay, Fritzing, KiCad or Stability AI mesh/model is bundled in this source repository. Three.js is an MIT-licensed dependency; its licence is included in its installed package.

The Modal worker installs the official Stable Fast 3D source and, after Hugging Face access is supplied, downloads its gated model weights. These are subject to Stability AI's model licence, linked from https://huggingface.co/stabilityai/stable-fast-3d. The cloned worker source retains upstream licence files. No Relay source code was copied for the new workflow.

The ESP32 DevKit V1 header order is adapted from `wokwi-elements/src/esp32-devkit-v1-element.ts` at revision `72d8b5b1f472121987d8c74b60a0e7a5d756c54c`. It is reference metadata for that specific 30-pin layout, not every ESP32/WROOM board.

Source: https://github.com/wokwi/wokwi-elements

The MIT License (MIT)

Copyright (c) 2020 Uri Shaked

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
