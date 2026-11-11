import { useEffect, useRef, useState } from "react";
import ElectronicsLab from "./ElectronicsLab";
import ProtoWorkbench from "./ProtoWorkbench";
import { labRecommendations, type LabRecommendation, type LabView } from "./lab-recommendations";
export type { LabView } from "./lab-recommendations";

export default function LabSuggestions({ topics, view = "auto" }: { topics: string[]; view?: LabView }) {
  const [active, setActive] = useState<LabRecommendation | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const matches = labRecommendations(topics, view);
  useEffect(() => {
    if (active && !dialog.current?.open) dialog.current?.showModal();
  }, [active]);

  if (!matches.length && !active) return null;
  return (
    <section
      className="lab-suggestions"
      aria-label="Suggested Electronics Lab tutorials"
    >
      {matches.length > 0 && <h3>Try in Electronics Lab</h3>}
      {matches.map((match) => (
        <div className="lab-suggestion-actions" key={match.tutorial.title}>
          <button className="text-button" onClick={() => setActive(match)}>
            {view === "auto" || match.tutorial.title === "3D Workbench" || match.tutorial.title === "Arduino Course"
              ? match.tutorial.title
              : `${match.view === "workbench" ? "3D Workbench" : "Arduino Course"} · ${match.tutorial.title}`}
          </button>
          {match.offerWorkbench && (
            <button
              className="text-button"
              aria-label={`Build in 3D — ${match.tutorial.title}`}
              onClick={() => setActive({ ...match, view: "workbench" })}
            >
              Build in 3D
            </button>
          )}
        </div>
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
              <h2 id="lab-tutorial-title">
                {active.view === "workbench" && active.tutorial.title !== "3D Workbench" ? "Build in 3D · " : ""}{active.tutorial.title}
              </h2>
              <button
                className="button secondary"
                onClick={() => dialog.current?.close()}
              >
                Back to Live Help
              </button>
            </header>
            {active.view === "workbench" ? (
              <ProtoWorkbench
                starter={active.starter}
                onGuided={() => setActive({ ...active, view: "course" })}
              />
            ) : (
              <ElectronicsLab tutorial={active.tutorial} navigate={() => dialog.current?.close()} />
            )}
          </>
        )}
      </dialog>
    </section>
  );
}
