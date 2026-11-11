import { ComponentLibrary } from "./ComponentPanel";
import { api, type LessonCard } from "./api";
import {
  validTopic,
  type ArduinoTopic,
} from "./arduino-reference";
import FullArduinoReference from "./FullArduinoReference";
import ProtoWorkbench from "./ProtoWorkbench";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import "./electronics-lab.css";
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
export type LabTutorial = {title: string; topic: ArduinoTopic};
export default function ElectronicsLab({
  navigate,
  role = "student",
  tutorial,
}: {
  navigate: (path: string) => void;
  role?: "instructor" | "student";
  tutorial?: LabTutorial;
}) {
  const params = new URLSearchParams(location.search);
  const lesson = params.get("lesson");
  const [view, setView] = useState<"workbench" | "course">(() => {
    if (tutorial) return "course";
    const requested = params.get("view");
    if (requested === "basics") return "workbench";
    if (requested === "workbench" || requested === "course") return requested;
    return lesson || validTopic(params.get("topic")) ? "course" : "workbench";
  });
  const [workbenchOpened, setWorkbenchOpened] = useState(view === "workbench");
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
      <div className="lab-view-tabs" role="group" aria-label="Electronics Lab view">
        <button
          className="button secondary"
          aria-pressed={view === "workbench"}
          onClick={() => {
            setWorkbenchOpened(true);
            setView("workbench");
          }}
        >
          3D Workbench
        </button>
        <button
          className="button secondary"
          aria-pressed={view === "course"}
          onClick={() => setView("course")}
        >
          Arduino course
        </button>
      </div>
      </>}
      {workbenchOpened && (
        <div hidden={view !== "workbench"}>
          <ProtoWorkbench onGuided={() => setView("course")} />
        </div>
      )}
      {view === "course" && (
        <FullArduinoReference topic={topic} onTopicChange={setTopic} />
      )}
      {!tutorial && <details className="panel"><summary>Component library</summary><ComponentLibrary /></details>}
    </section>
  );
}
