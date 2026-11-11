import { ARDUINO_TOPICS, type ArduinoTopic } from "./arduino-reference";
import type { ProtoStarter } from "./ProtoWorkbench";

export type LabView = "auto" | "workbench" | "course";
export type LabRecommendation = {
  tutorial: { title: string; topic: ArduinoTopic };
  view: Exclude<LabView, "auto">;
  starter?: ProtoStarter;
  offerWorkbench: boolean;
};

const starters: Partial<Record<string, ProtoStarter>> = {
  board: "board", blink: "led", resistor: "led", return_path: "led", sensor: "sensor",
};
const fundamentals: Record<string, { title: string; topic: ArduinoTopic }> = {
  board: { title: "Explore the development board", topic: "board" },
  resistor: { title: "Follow the current through a resistor", topic: "blink" },
  return_path: { title: "Trace the return path", topic: "blink" },
};

export function labRecommendations(topics: string[], view: LabView = "auto"): LabRecommendation[] {
  return [...new Set(topics)].flatMap((topic): LabRecommendation[] => {
    if (topic === "workbench") return [{ tutorial: { title: "3D Workbench", topic: "board" }, view: "workbench", offerWorkbench: false }];
    if (topic === "arduino_course") return [{ tutorial: { title: "Arduino Course", topic: "board" }, view: "course", offerWorkbench: false }];
    const reference = ARDUINO_TOPICS.find(({ id }) => id === topic);
    const tutorial = fundamentals[topic] ?? (reference && { title: reference.title, topic: reference.id });
    if (!tutorial) return [];
    const destination = view === "auto" ? (fundamentals[topic] ? "workbench" : "course") : view;
    return [{ tutorial, view: destination, starter: starters[topic], offerWorkbench: view === "auto" && destination === "course" && !!starters[topic] }];
  });
}
