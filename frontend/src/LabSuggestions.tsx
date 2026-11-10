import { useEffect, useRef, useState } from "react";
import ElectronicsLab, { type LabTutorial } from "./ElectronicsLab";
import type { ComponentScene, PartId } from "./components-api";

const blink: LabTutorial = { title: "Blink an LED", topic: "blink" };
const tutorials: Partial<Record<PartId, LabTutorial>> = {
  esp32: { title: "Explore the development board", part: "board", stage: 0 },
  resistor: {
    title: "Follow the current through a resistor",
    part: "resistor",
    stage: 1,
  },
  led: blink,
  breadboard: blink,
  wire: { title: "Trace the return path", part: "led", stage: 2 },
};

export default function LabSuggestions({ scene }: { scene: ComponentScene }) {
  const [active, setActive] = useState<LabTutorial | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const matches = new Map<LabTutorial, Set<string>>();
  for (const part of scene.components) {
    const tutorial = tutorials[part.part_id];
    if (!tutorial) continue;
    const parts = matches.get(tutorial) ?? new Set<string>();
    const name =
      part.part_id === "esp32"
        ? "ESP32"
        : part.part_id === "led"
          ? "LED"
          : part.part_id;
    parts.add(part.uncertain && !part.confirmed ? `Possible ${name}` : name);
    matches.set(tutorial, parts);
  }
  useEffect(() => {
    if (active) dialog.current?.showModal();
  }, [active]);

  if (!matches.size) return null;
  return (
    <section
      className="lab-suggestions"
      aria-label="Suggested Electronics Lab tutorials"
    >
      <h3>Try in Electronics Lab</h3>
      {[...matches].map(([tutorial, parts]) => (
        <button
          key={tutorial.title}
          className="text-button"
          onClick={() => setActive(tutorial)}
        >
          {tutorial.title} <small>{[...parts].join(", ")}</small>
        </button>
      ))}
      <dialog
        className="lab-tutorial"
        ref={dialog}
        onClose={() => setActive(null)}
        aria-labelledby="lab-tutorial-title"
      >
        {active && (
          <>
            <header>
              <h2 id="lab-tutorial-title">{active.title}</h2>
              <button
                className="button secondary"
                onClick={() => dialog.current?.close()}
              >
                Back to Live Help
              </button>
            </header>
            <ElectronicsLab
              tutorial={active}
              navigate={() => dialog.current?.close()}
            />
          </>
        )}
      </dialog>
    </section>
  );
}
