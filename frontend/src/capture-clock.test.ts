import { describe, expect, it } from "vitest";
import { captureElapsedMs } from "./capture-clock";

describe("recording duration", () => {
  const start = Date.parse("2026-10-14T00:00:00Z");
  const session = { created_at: new Date(start).toISOString() };

  it("counts while recording and freezes immediately on Finish during slow analysis", () => {
    expect(captureElapsedMs(session, null, start + 12500)).toBe(12500);
    expect(captureElapsedMs(session, start + 12500, start + 60000)).toBe(12500);
    expect(captureElapsedMs(session, start + 12500, start + 180000)).toBe(
      12500,
    );
  });

  it("restores the saved recording duration after refresh or finalization retry", () => {
    const finished = {
      ...session,
      finished_at: new Date(start + 12500).toISOString(),
    };
    expect(captureElapsedMs(finished, null, start + 60000)).toBe(12500);
    expect(captureElapsedMs(finished, null, start + 86400000)).toBe(12500);
  });
});
