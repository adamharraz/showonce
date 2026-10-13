# Integrated electronics design

Integrated origin/main at 2c92f51 with the local demonstration-first and UI Skills work. The colourful electronics concept requested by the owner is used on sign-in and the library. Capture, review, practice, Live Coach and prepared component references retain their real controls and quieter reading surfaces. The app continues to support screen-based tasks.

The workbench illustration is decorative, not a wiring diagram, captured lesson evidence or a recognition result. It is generated with the built-in imagegen tool and saved at frontend/src/assets/electronics-workbench.png. Vite bundles it under /assets so it works with the FastAPI production server. Headings and buttons are real HTML; the artwork contains no baked text or controls.

Generation prompt: Create a wide horizontal 3:1 illustrated website background asset for ShowOnce electronics learning workspace. NO text, lettering, logos, buttons or UI. Cheerful colourful cartoon artwork with crisp shapes and friendly adult-beginner aesthetic. Sky-blue background and open centre for HTML heading and action. Along bottom and corners: a white breadboard with red/blue rails, colourful LEDs, striped resistors, jumper wires, a green microcontroller development board with black pin headers and USB connector, and a pushbutton. Light wooden workbench at the bottom. Recognisable educational components, not circuit instructions. No beach, plants, people, gradients or AI sparkles. Saturated blue, coral, yellow and green; coherent original illustration.

Existing backend behaviour from the latest main is retained: fixed model responsibilities, advisory live coaching, consent, authenticated frames, component confirmation, withheld unconfirmed board pinout, saved conversations and disabled-by-default mesh generation. The library preview metadata and privacy regression from the redesign remain.

Validation: 81 backend tests, seven frontend tests and production build passed. Full lesson workflow and component-coach browser workflow passed with explicitly isolated model fixtures and synthetic media. Search/filter/resume checks and keyboard/touch/motion checks passed. Eleven design checks include rendered-text contrast across eight screens. Desktop/mobile layouts inspected. No real Gemini or GPU inference was used for this integration verification.

Remaining limits: manual screen-reader and full WCAG audits are unverified. The lazy-loaded Three.js component-viewer bundle still triggers Vite's 500kB warning. The generated PNG is approximately 1.55MB. These are performance follow-ups, not failed builds.

The pre-integration local changes remain in a Git stash as a backup. This integration is local only; no push, merge on GitHub or deployment was performed.
