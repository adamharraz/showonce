import { expect, it } from "vitest";
import { labRecommendations } from "./lab-recommendations";

it("opens a blank bench and a guided course overview as distinct resources", () => {
  const [bench, course] = labRecommendations(["workbench", "arduino_course"]);
  expect(bench.view).toBe("workbench");
  expect(bench.starter).toBeUndefined();
  expect(course.view).toBe("course");
  expect(course.tutorial.topic).toBe("board");
});

it("honours Gemini's choice between guidance and free building on the same subject", () => {
  const [guided] = labRecommendations(["board"], "course");
  const [build] = labRecommendations(["board"], "workbench");
  expect(guided.view).toBe("course");
  expect(guided.offerWorkbench).toBe(false);
  expect(build.view).toBe("workbench");
  expect(build.starter).toBe("board");
  expect(labRecommendations(["resistor"], "course")[0].tutorial.topic).toBe("blink");
  expect(labRecommendations(["servo"], "workbench")[0].starter).toBeUndefined();
});

it("keeps existing relevant choices and ignores unsupported topics", () => {
  const [sensor] = labRecommendations(["sensor", "sensor", "unavailable"]);
  expect(sensor.view).toBe("course");
  expect(sensor.starter).toBe("sensor");
  expect(sensor.offerWorkbench).toBe(true);
  expect(labRecommendations(["resistor"])[0].view).toBe("workbench");
  expect(labRecommendations([])).toEqual([]);
});
