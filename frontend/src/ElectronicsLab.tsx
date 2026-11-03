import { api, type LessonCard } from "./api";
import {
  ARDUINO_TOPICS,
  validTopic,
  type ArduinoTopic,
} from "./arduino-reference";
import FullArduinoReference from "./FullArduinoReference";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Box, ChevronRight, Play, Square } from "lucide-react";
import "./electronics-lab.css";
const Circuit = lazy(() => import("./LabCircuit"));
export const LAB_STAGES = [
  {
    title: "Meet the parts",
    text: "Explore the board, resistor and LED. Select a part to learn what it does.",
  },
  {
    title: "Follow the output",
    text: "The output connects through a current-limiting resistor to the LED’s anode (+).",
  },
  {
    title: "Complete the return",
    text: "The LED’s cathode (−) returns to GND, completing the path.",
  },
  {
    title: "Preview the blink",
    text: "The program switches the output high and low. Watch how that changes the LED.",
  },
];
export const LAB_PARTS = {
  board: {
    name: "Development board",
    text: "The program controls an output pin. Use the board and GPIO specified in your approved lesson.",
  },
  resistor: {
    name: "Resistor",
    text: "Limits current through the LED. Choose its value from your lesson and the component ratings.",
  },
  led: {
    name: "LED",
    text: "Has an anode (+) and cathode (−). Polarity matters; confirm it from the component markings or datasheet.",
  },
};
export type LabPart = keyof typeof LAB_PARTS;
export default function ElectronicsLab({
  navigate,
  role = "student",
}: {
  navigate: (path: string) => void;
  role?: "instructor" | "student";
}) {
  const [view, setView] = useState<"course" | "basics">("course");
  const [stage, setStage] = useState(0);
  const [selected, setSelected] = useState<LabPart>("board");
  const [running, setRunning] = useState(false);
  const [reset, setReset] = useState(0);
  const params = new URLSearchParams(location.search);
  const lesson = params.get("lesson");
  const [topic, setTopic] = useState<ArduinoTopic>(() =>
    validTopic(params.get("topic"))
      ? (params.get("topic") as ArduinoTopic)
      : "board",
  );
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [lessonError, setLessonError] = useState("");
  useEffect(() => {
    let active = true;
    api<LessonCard[]>("/lessons")
      .then((items) => {
        if (active) setLessons(items.filter((item) => !!item.latest_version));
      })
      .catch(() => {
        if (active)
          setLessonError(
            "Your saved lessons could not load. The reference is still available.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const currentLesson = lessons.find((item) => item.id === lesson);
  const returnPath =
    lesson && /^[a-zA-Z0-9_-]+$/.test(lesson) ? `/lesson/${lesson}` : "/";
  function choose(next: number) {
    setStage(next);
    setRunning(false);
  }
  return (
    <section className="electronics-lab">
      <button className="text-button" onClick={() => navigate(returnPath)}>
        <ArrowLeft size={16} />{" "}
        {returnPath === "/" ? "Back to lessons" : "Back to your lesson"}
      </button>
      <div className="page-heading">
        <div>
          <h1>Electronics lab</h1>
          <p>Explore a reference, then practise your own build.</p>
        </div>
        <span className="badge">
          <Box size={15} /> Electronics reference
        </span>
      </div>
      <section className="lab-learning-context" aria-label="Your learning task">
        <div>
          <span className="small muted">
            {currentLesson ? "Your lesson" : "Your next step"}
          </span>
          <h2>
            {currentLesson?.title || "Bring the reference into your own task"}
          </h2>
          <p>
            {currentLesson
              ? "Use the reference to understand the parts. Return to your approved lesson to practise and check your build."
              : "Choose a published lesson for practice, or explore the reference on its own."}
          </p>
        </div>
        <div className="lab-context-actions">
          {currentLesson ? (
            <button
              className="button primary"
              onClick={() => navigate(returnPath)}
            >
              Continue lesson <ChevronRight size={16} />
            </button>
          ) : (
            <button className="button primary" onClick={() => navigate("/")}>
              Find a lesson <ChevronRight size={16} />
            </button>
          )}
          {role === "instructor" && (
            <button
              className="button secondary"
              onClick={() => navigate("/studio")}
            >
              Teach this task
            </button>
          )}
        </div>
        {lessons.length > 0 && (
          <label className="lab-lesson-picker">
            Practice lesson
            <select
              aria-label="Choose a practice lesson"
              value={currentLesson?.id || ""}
              onChange={(e) =>
                navigate(
                  `/lab/electronics?topic=${topic}${e.target.value ? `&lesson=${encodeURIComponent(e.target.value)}` : ""}`,
                )
              }
            >
              <option value="">Explore without a lesson</option>
              {lessons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {lessonError && (
          <p className="fine" role="status">
            {lessonError}
          </p>
        )}
      </section>
      <div className="lab-view-tabs" role="group" aria-label="Reference view">
        <button
          className="button secondary"
          aria-pressed={view === "course"}
          onClick={() => setView("course")}
        >
          Arduino course
        </button>
        <button
          className="button secondary"
          aria-pressed={view === "basics"}
          onClick={() => setView("basics")}
        >
          Circuit basics
        </button>
      </div>
      {view === "course" ? (
        <FullArduinoReference topic={topic} onTopicChange={setTopic} />
      ) : (
        <>
          <div className="lab-layout">
            <div className="lab-workbench">
              <Suspense fallback={<p role="status">Loading the circuit…</p>}>
                <Circuit
                  stage={stage}
                  running={running}
                  reset={reset}
                  onSelect={setSelected}
                />
              </Suspense>
              <div className="lab-view-controls">
                <span>Drag to rotate · scroll or pinch to zoom</span>
                <button
                  className="text-button"
                  onClick={() => setReset((n) => n + 1)}
                >
                  Reset view
                </button>
              </div>
              <p className="lab-caption">
                Conceptual 3D reference. The connectors show the circuit path,
                not physical pin or breadboard positions.
              </p>
              <div
                className="lab-parts"
                role="group"
                aria-label="Explore components"
              >
                {(Object.keys(LAB_PARTS) as LabPart[]).map((id) => (
                  <button
                    key={id}
                    aria-pressed={selected === id}
                    onClick={() => setSelected(id)}
                  >
                    {LAB_PARTS[id].name}
                  </button>
                ))}
              </div>
              <div className="lab-part-detail" aria-live="polite">
                <h2>{LAB_PARTS[selected].name}</h2>
                <p>{LAB_PARTS[selected].text}</p>
              </div>
            </div>
            <aside className="panel lab-guide">
              <h2>Blink an LED</h2>
              <p className="muted">
                A guided reference, separate from your lesson assessment.
              </p>
              <ol className="lab-stages">
                {LAB_STAGES.map((step, i) => (
                  <li key={step.title}>
                    <button
                      aria-current={stage === i ? "step" : undefined}
                      onClick={() => choose(i)}
                    >
                      <span>{i + 1}</span>
                      {step.title}
                    </button>
                  </li>
                ))}
              </ol>
              <div aria-live="polite">
                <h3>{LAB_STAGES[stage].title}</h3>
                <p>{LAB_STAGES[stage].text}</p>
              </div>
              <div className="lab-actions">
                {stage < LAB_STAGES.length - 1 ? (
                  <button
                    className="button primary"
                    onClick={() => choose(stage + 1)}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    aria-pressed={running}
                    onClick={() => setRunning((v) => !v)}
                  >
                    {running ? <Square size={16} /> : <Play size={16} />}
                    {running ? "Stop preview" : "Play blink preview"}
                  </button>
                )}
              </div>
              <p className="fine">
                The preview illustrates a programmed blink. It does not run
                Arduino code or test electrical behaviour.
              </p>
              <details>
                <summary>Circuit path</summary>
                <p>
                  Output → resistor → LED anode (+)
                  <br />
                  LED cathode (−) → GND
                </p>
                <p>
                  These connections form one series path. Follow your lesson for
                  the actual board, pin, resistor value and breadboard layout.
                </p>
              </details>
              <button
                className="button secondary"
                onClick={() => navigate(returnPath)}
              >
                {returnPath === "/"
                  ? "Choose a lesson to practise"
                  : "Continue your lesson"}
              </button>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
