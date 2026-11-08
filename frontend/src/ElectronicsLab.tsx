import { ComponentLibrary } from "./ComponentPanel";
import PartQuestion from "./PartQuestion";
import { api, type LessonCard } from "./api";
import {
  ARDUINO_TOPICS,
  validTopic,
  type ArduinoTopic,
} from "./arduino-reference";
import FullArduinoReference from "./FullArduinoReference";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Play, Square } from "lucide-react";
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
export type LabTutorial = {title: string; part?: LabPart; stage?: number; topic?: ArduinoTopic};
export default function ElectronicsLab({
  navigate,
  role = "student",
  tutorial,
}: {
  navigate: (path: string) => void;
  role?: "instructor" | "student";
  tutorial?: LabTutorial;
}) {
  const [view, setView] = useState<"course" | "basics">(() => tutorial?.part || (!tutorial && new URLSearchParams(location.search).get("view") === "basics") ? "basics" : "course");
  const [stage, setStage] = useState(tutorial?.stage ?? 0);
  const [selected, setSelected] = useState<LabPart>(tutorial?.part ?? "board");
  const [highlight, setHighlight] = useState<LabPart | null>(null);
  function selectPart(part: LabPart) { setSelected(part); setHighlight(null); }
  const [running, setRunning] = useState(false);
  const [reset, setReset] = useState(0);
  const params = new URLSearchParams(location.search);
  const lesson = params.get("lesson");
  const [topic, setTopic] = useState<ArduinoTopic>(() =>
    tutorial?.topic ?? (validTopic(params.get("topic"))
      ? (params.get("topic") as ArduinoTopic)
      : "board"),
  );
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [lessonError, setLessonError] = useState("");
  useEffect(() => {
    if (tutorial) return;
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
  }, [tutorial]);
  const currentLesson = lessons.find((item) => item.id === lesson);
  const returnPath =
    lesson && /^[a-zA-Z0-9_-]+$/.test(lesson) ? `/lesson/${lesson}` : "/";
  function choose(next: number) {
    setStage(next);
    setRunning(false);
  }
  return (
    <section className="electronics-lab">
      {!tutorial && <>
      <div className="page-heading"><h1>Electronics lab</h1></div>
      <div className="lab-context-actions">
        <button
          className="button secondary"
          onClick={() => {
            const context = new URLSearchParams({ mode: "electronics", topic });
            const lessonPath = currentLesson
              ? `/coach/${encodeURIComponent(currentLesson.id)}/${currentLesson.latest_version}`
              : "/coach";
            navigate(`${lessonPath}?${context}`);
          }}
        >
          Ask the electronics coach
        </button>
        {currentLesson && <button className="text-button" onClick={() => navigate(returnPath)}><ArrowLeft size={16}/> {currentLesson.title}</button>}
        {role === "instructor" && <button className="text-button" onClick={() => navigate("/studio")}>Teach this task</button>}
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
      </div>
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
      </>}
      {view === "course" ? (
        <FullArduinoReference topic={topic} onTopicChange={setTopic} />
      ) : (
        <>
          <div className="lab-layout">
            <div className="lab-workbench">
              <Suspense fallback={<p role="status">Loading the circuit…</p>}>
                <Circuit
                  selected={highlight || selected}
                  stage={stage}
                  running={running}
                  reset={reset}
                  onSelect={selectPart}
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
                    onClick={() => selectPart(id)}
                  >
                    {LAB_PARTS[id].name}
                  </button>
                ))}
              </div>
              <div className="lab-part-detail" aria-live="polite">
                <h2>{LAB_PARTS[selected].name}</h2>
                <p>{LAB_PARTS[selected].text}</p>
                {!tutorial && <PartQuestion key={selected} part={selected} endpoint="/circuit/part-question" onHighlight={setHighlight} />}
              </div>
            </div>
            <aside className="panel lab-guide">
              <h2>Blink an LED</h2>

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
              {!tutorial && <button
                className="button secondary"
                onClick={() => navigate(returnPath)}
              >
                {returnPath === "/"
                  ? "Choose a lesson to practise"
                  : "Continue your lesson"}
              </button>}
            </aside>
          </div>
        </>
      )}
      {!tutorial && <details className="panel"><summary>Component library</summary><ComponentLibrary /></details>}
    </section>
  );
}
