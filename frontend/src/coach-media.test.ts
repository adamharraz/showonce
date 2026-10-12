import { describe, expect, it } from "vitest";
import { bytesToBase64, decodePcm, pcm16 } from "./coach-media";

describe("native live audio transport", () => {
  it("resamples microphone audio to mono 16kHz little-endian PCM", () => {
    const result = pcm16(new Float32Array([-1, 0, 1, 0, -1, 0]), 48000);
    expect(result.length).toBe(4);
    const samples = new DataView(result.buffer);
    expect(samples.getInt16(0, true)).toBe(-32768);
    expect(samples.getInt16(2, true)).toBe(0);
  });
  it("clips samples and decodes signed native audio without pitch conversion", () => {
    const data = pcm16(new Float32Array([-2, 0, 2]), 16000);
    expect(Array.from(decodePcm(bytesToBase64(data)))).toEqual([
      -1,
      0,
      32767 / 32768,
    ]);
  });
  it("accepts URL-safe base64 and ignores an incomplete final sample", () => {
    const data = bytesToBase64(new Uint8Array([255, 127, 255]));
    expect(
      Array.from(decodePcm(data.replaceAll("/", "_").replaceAll("+", "-"))),
    ).toEqual([32767 / 32768]);
  });
});
