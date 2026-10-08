import { expect, test } from "vitest";
import { unresolved, reorder } from "./review";
import type { Draft } from "./api";
test("required unanswered questions on individual steps block review", () => {
  const d = {
    title: "Example",
    steps: [
      {
        questions: [
          { id: "q", text: "Which setting?", required: true, answer: "  " },
        ],
      },
    ],
    questions: [{ id: "q2", text: "Optional?", required: false, answer: "" }],
  } as Draft;
  expect(unresolved(d)).toHaveLength(1);
  d.steps[0].questions![0].answer = "Observed setting";
  expect(unresolved(d)).toHaveLength(0);
});
test("reordering preserves identity and does not mutate the draft", () => {
  const steps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(reorder(steps, 1, -1).map((s) => s.id)).toEqual(["b", "a", "c"]);
  expect(steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
  expect(reorder(steps, 0, -1)).toEqual(steps);
});
