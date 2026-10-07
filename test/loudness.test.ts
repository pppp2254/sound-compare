import { expect, test } from "bun:test";
import { loudness, SAMPLE_RATE } from "../src/analyze";

const tone = (hz: number, sec: number, dbfs: number) => {
  const amp = Math.pow(10, dbfs / 20);
  return Float32Array.from({ length: SAMPLE_RATE * sec }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE));
};

test("stereo 1 kHz tone at -23 dBFS is -23 LUFS", () => {
  const t = tone(1000, 20, -23);
  expect(loudness([t, t]).lufs).toBeCloseTo(-23, 0);
});

test("the same tone in mono is 3 dB quieter", () => {
  expect(loudness([tone(1000, 20, -23)]).lufs).toBeCloseTo(-26, 0);
});

test("tone that steps from -20 to -30 dBFS has a loudness range near 10 LU", () => {
  const a = tone(1000, 10, -20), b = tone(1000, 10, -30);
  const both = new Float32Array(a.length + b.length);
  both.set(a);
  both.set(b, a.length);
  expect(Math.abs(loudness([both, both]).lra - 10)).toBeLessThan(1);
});

test("silence is reported as very quiet, not a crash", () => {
  const r = loudness([new Float32Array(SAMPLE_RATE * 5)]);
  expect(r.lufs).toBeLessThan(-69);
  expect(r.lra).toBe(0);
});
