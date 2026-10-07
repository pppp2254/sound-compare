import { expect, test } from "bun:test";
import { advise, pickBetter, rank, whyBest, type Measures } from "../src/advice";

const good: Measures = {
  lufs: -14, lra: 7, peakDb: -1.5, clippingPct: 0, tiltDbPerOct: -4.5,
  residual: { boom: 0, mud: 0, harsh: 0, air: 0 },
  leadSilenceSec: 0.2, trailSilenceSec: 0.5, bitrateKbps: 256,
  vsBodyDb: { presence: -12, harsh: -22, hiss: -30 },
};

const find = (m: Measures, area: string) => advise(m, "music").items.find((i) => i.area === area);

test("a balanced file scores high and has nothing to fix", () => {
  const r = advise(good, "music");
  expect(r.score).toBeGreaterThanOrEqual(95);
  expect(r.items.filter((i) => i.level !== "ok")).toHaveLength(0);
});

test("a file that is too loud is told to lower volume by the right amount", () => {
  const item = find({ ...good, lufs: -8 }, "Volume");
  expect(item?.level).not.toBe("ok");
  expect(item?.change).toBe("Lower volume by 6.0 dB");
});

test("a quiet file is told to raise volume", () => {
  expect(find({ ...good, lufs: -22 }, "Volume")?.change).toBe("Raise volume by 8.0 dB");
});

test("speech uses a -16 LUFS target", () => {
  const item = advise({ ...good, lufs: -16 }, "speech").items.find((i) => i.area === "Volume");
  expect(item?.level).toBe("ok");
});

test("raising a quiet file with high peaks also asks for a limiter", () => {
  const item = find({ ...good, lufs: -22, peakDb: -2 }, "Volume");
  expect(item?.detail).toContain("limiter");
});

test("clipping is a major problem", () => {
  expect(find({ ...good, clippingPct: 0.5 }, "Clipping")?.level).toBe("major");
});

test("peaks above -1 dBFS are flagged", () => {
  expect(find({ ...good, peakDb: -0.1 }, "Peaks")?.level).not.toBe("ok");
});

test("very compressed audio is flagged", () => {
  expect(find({ ...good, lra: 1.5 }, "Dynamics")?.level).not.toBe("ok");
});

test("bright sound is told to lower treble", () => {
  expect(find({ ...good, tiltDbPerOct: -1 }, "Tone balance")?.change).toContain("Lower treble");
});

test("dull sound is told to raise treble", () => {
  expect(find({ ...good, tiltDbPerOct: -8.5 }, "Tone balance")?.change).toContain("Raise treble");
});

test("a harsh bump is told to cut 2-5 kHz", () => {
  expect(find({ ...good, residual: { ...good.residual, harsh: 5 } }, "Harshness")?.change).toBe("Cut 2-5 kHz by about 5.0 dB");
});

test("long silence at the start is told to trim", () => {
  expect(find({ ...good, leadSilenceSec: 4 }, "Silence")?.change).toContain("Trim");
});

test("the clean file is picked over a loud clipped one", () => {
  const bad = advise({ ...good, lufs: -6, peakDb: 0, clippingPct: 1 }, "music");
  const r = pickBetter(advise(good, "music"), bad);
  expect(r.winner).toBe("A");
});

test("two nearly equal files are called about the same", () => {
  const r = pickBetter(advise(good, "music"), advise({ ...good, lufs: -14.5 }, "music"));
  expect(r.winner).toBe("same");
});

test("a very large bump still suggests at most a 6 dB cut", () => {
  const item = find({ ...good, residual: { ...good.residual, mud: 19.9 } }, "Muddiness");
  expect(item?.change).toBe("Cut 200-500 Hz by about 6.0 dB");
  expect(item?.detail).toContain("19.9 dB");
});

test("advice can be given in Thai", () => {
  const item = advise({ ...good, lufs: -8 }, "music", "th").items.find((i) => i.area === "Volume");
  expect(item?.label).toBe("ความดัง");
  expect(item?.change).toBe("ลดความดัง 6.0 dB");
});

test("rank orders three files best first", () => {
  const r = [advise({ ...good, lufs: -6 }, "music"), advise(good, "music"), advise({ ...good, clippingPct: 1 }, "music")];
  const { order, tied } = rank(r);
  expect(order[0]).toBe(1);
  expect(tied).toEqual([1]);
});

test("whyBest lists problems the other files have and the best does not", () => {
  const r = [advise({ ...good, lufs: -6 }, "music"), advise(good, "music"), advise({ ...good, clippingPct: 1 }, "music")];
  expect(whyBest(r, 1)).toEqual(["Clipping", "Volume"]);
});

test("strong hiss above 8 kHz is flagged with noise reduction advice", () => {
  const item = find({ ...good, vsBodyDb: { ...good.vsBodyDb, hiss: -12.8 } }, "Hiss");
  expect(item?.level).not.toBe("ok");
  expect(item?.change).toContain("noise reduction");
});

test("sharp 5-8 kHz is flagged with de-esser advice", () => {
  const item = find({ ...good, vsBodyDb: { ...good.vsBodyDb, harsh: -9.6 } }, "Sibilance");
  expect(item?.change).toContain("de-esser");
});

test("a hissy file at the right volume loses to a clean file that is 5 dB quiet", () => {
  const hissy = advise({ ...good, tiltDbPerOct: -1.2, vsBodyDb: { presence: -9, harsh: -9.6, hiss: -12.8 } }, "music");
  const clean = advise({ ...good, lufs: -19 }, "music");
  expect(clean.score).toBeGreaterThan(hissy.score);
});
