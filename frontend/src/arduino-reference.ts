export const ARDUINO_TOPICS = [
  { id: "board", title: "Meet the board" },
  { id: "blink", title: "Blink an LED" },
  { id: "button", title: "Push a button" },
  { id: "knob", title: "Turn a knob" },
  { id: "rgb", title: "Mix colours" },
  { id: "light", title: "Sense light" },
  { id: "sensor", title: "Read a sensor" },
  { id: "sound", title: "Make a sound" },
  { id: "piano", title: "Mini piano" },
  { id: "motor", title: "Control a motor" },
  { id: "heat", title: "Sense heat" },
  { id: "servo", title: "Sweep a servo" },
  { id: "stepper", title: "Spin the wheel" },
  { id: "plant", title: "Smart plant" },
  { id: "force", title: "Feel the force" },
  { id: "project", title: "Build a project" },
] as const;
export type ArduinoTopic = (typeof ARDUINO_TOPICS)[number]["id"];
export function validTopic(value: unknown): value is ArduinoTopic {
  return (
    typeof value === "string" &&
    ARDUINO_TOPICS.some((topic) => topic.id === value)
  );
}
export function readReferenceState(
  data: unknown,
): { topic: ArduinoTopic; ready: boolean; webgl: boolean } | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (
    value.type !== "showonce:arduino-state" ||
    !validTopic(value.topic) ||
    typeof value.ready !== "boolean" ||
    typeof value.webgl !== "boolean"
  )
    return null;
  return { topic: value.topic, ready: value.ready, webgl: value.webgl };
}
export function referenceTopicForLesson(text: string): ArduinoTopic {
  const patterns: [RegExp, ArduinoTopic][] = [
    [/\b(rgb|colou?rs)\b/i, "rgb"],
    [/\b(led|blink)\b/i, "blink"],
    [/\b(button|switch)\b/i, "button"],
    [/\b(potentiometer|knob)\b/i, "knob"],
    [/\b(ultrasonic|distance)\b/i, "sensor"],
    [/\b(servo)\b/i, "servo"],
    [/\b(stepper)\b/i, "stepper"],
    [/\b(motor)\b/i, "motor"],
    [/\b(temperature|heat)\b/i, "heat"],
    [/\b(ldr|light)\b/i, "light"],
    [/\b(buzzer|sound)\b/i, "sound"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] || "board";
}
