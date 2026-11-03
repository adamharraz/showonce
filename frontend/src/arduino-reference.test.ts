import { expect, it } from "vitest";
import {
  readReferenceState,
  referenceTopicForLesson,
} from "./arduino-reference";
it("accepts only the narrow reference message protocol", () => {
  expect(
    readReferenceState({
      type: "showonce:arduino-state",
      topic: "blink",
      ready: true,
      webgl: false,
    }),
  ).toEqual({ topic: "blink", ready: true, webgl: false });
  for (const topic of ["../../api/me", "<script>", "not-a-topic", null, {}, 23])
    expect(
      readReferenceState({
        type: "showonce:arduino-state",
        topic,
        ready: true,
        webgl: true,
      }),
    ).toBeNull();
  expect(
    readReferenceState({
      type: "showonce:arduino-state",
      topic: "blink",
      ready: "yes",
      webgl: true,
    }),
  ).toBeNull();
  expect(
    readReferenceState({
      type: "showonce:approve-checkpoint",
      topic: "blink",
      ready: true,
      webgl: true,
    }),
  ).toBeNull();
  expect(readReferenceState(null)).toBeNull();
});
it("suggests a reference topic without claiming hardware equivalence", () => {
  expect(referenceTopicForLesson("ESP32 external LED circuit")).toBe("blink");
  expect(referenceTopicForLesson("RGB LED colour mixing")).toBe("rgb");
  expect(referenceTopicForLesson("Spreadsheet totals")).toBe("board");
});
