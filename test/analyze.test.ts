import { expect, test } from "bun:test";
import { analyze, compare, SAMPLE_RATE } from "../src/analyze";

let seed = 1;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const sine = (hz: number, sec: number, amp = 1) =>
  Float32Array.from({ length: SAMPLE_RATE * sec }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE));

const clicks = (bpm: number, sec: number) => {
  const out = new Float32Array(SAMPLE_RATE * sec);
  const every = Math.round((60 / bpm) * SAMPLE_RATE);
  for (let start = 0; start < out.length; start += every)
    for (let i = 0; i < 200 && start + i < out.length; i++) out[start + i] = random() * 2 - 1;
  return out;
};

test("full scale sine has rms near -3 dB and peak near 0 dB", () => {
  const a = analyze(sine(440, 3));
  expect(a.rmsDb).toBeCloseTo(-3.01, 1);
  expect(a.peakDb).toBeCloseTo(0, 1);
  expect(a.durationSec).toBeCloseTo(3, 1);
});

test("440 Hz sine has its brightness near 440 Hz and pitch A", () => {
  const a = analyze(sine(440, 3, 0.5));
  expect(Math.abs(a.centroidHz - 440)).toBeLessThan(30);
  expect(a.chroma.indexOf(1)).toBe(9);
});

test("120 BPM clicks give a tempo near 120", () => {
  const a = analyze(clicks(120, 20));
  expect(Math.abs(a.bpm - 120)).toBeLessThan(3);
});

test("90 BPM clicks give a tempo near 90", () => {
  const a = analyze(clicks(90, 20));
  expect(Math.abs(a.bpm - 90)).toBeLessThan(3);
});

test("half silent signal reports about 50 percent silence", () => {
  const s = new Float32Array(SAMPLE_RATE * 4);
  s.set(sine(440, 2, 0.5));
  expect(Math.abs(analyze(s).silencePct - 50)).toBeLessThan(3);
});

test("comparing a file with itself is about 100 percent", () => {
  const a = analyze(clicks(120, 10));
  expect(compare(a, a).overallPct).toBeGreaterThan(99);
});

test("a low tone and a high tone are not similar in spectrum", () => {
  const c = compare(analyze(sine(100, 3, 0.5)), analyze(sine(3000, 3, 0.5)));
  expect(c.spectrumPct).toBeLessThan(50);
});

test("silence does not crash and reports 100 percent silence", () => {
  const a = analyze(new Float32Array(SAMPLE_RATE));
  expect(a.silencePct).toBe(100);
  expect(compare(a, a).overallPct).toBeGreaterThanOrEqual(0);
});

const pulse = (bpm: number, sec: number, amp: number) =>
  sine(330, sec, amp).map((s, i) => s * (0.5 + 0.5 * Math.sin((2 * Math.PI * (bpm / 60) * i) / SAMPLE_RATE)));

test("soft 120 BPM pulse gives a tempo near 120", () => {
  expect(Math.abs(analyze(pulse(120, 20, 0.5)).bpm - 120)).toBeLessThan(3);
});

test("tempo does not change with volume", () => {
  const loud = analyze(pulse(120, 20, 0.8)).bpm;
  const quiet = analyze(pulse(120, 20, 0.1)).bpm;
  expect(Math.abs(loud - quiet)).toBeLessThan(1);
});

test("a steady tone has no clear tempo", () => {
  expect(analyze(sine(330, 20, 0.5)).bpm).toBe(0);
});

test("noise has no clear tempo", () => {
  const noise = Float32Array.from({ length: SAMPLE_RATE * 20 }, () => (random() * 2 - 1) * 0.3);
  expect(analyze(noise).bpm).toBe(0);
});

test("tempo is left out of the score when there is no clear beat", () => {
  const a = analyze(sine(330, 10, 0.5));
  const c = compare(a, a);
  expect(c.tempoPct).toBeNull();
  expect(c.overallPct).toBeGreaterThan(99);
});

test("a chord and noise are not similar in harmony", () => {
  const chord = sine(220, 5, 0.3).map((s, i) => s + 0.3 * Math.sin((2 * Math.PI * 277 * i) / SAMPLE_RATE));
  const noise = Float32Array.from({ length: SAMPLE_RATE * 5 }, () => (random() * 2 - 1) * 0.3);
  expect(compare(analyze(chord), analyze(noise)).harmonyPct).toBeLessThan(40);
});

const chord = (freqs: number[], sec: number) =>
  Float32Array.from({ length: SAMPLE_RATE * sec }, (_, i) =>
    freqs.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE), 0) * (0.8 / freqs.length));

test("A major chord gives the key A major", () => {
  expect(analyze(chord([220, 277.18, 329.63], 5)).key).toBe("A major");
});

test("G major chord gives the key G major", () => {
  expect(analyze(chord([196, 246.94, 293.66], 5)).key).toBe("G major");
});

test("A minor chord gives the key A minor", () => {
  expect(analyze(chord([220, 261.63, 329.63], 5)).key).toBe("A minor");
});

test("spectrum of a full scale tone peaks close to 0 dBFS", () => {
  const peak = Math.max(...analyze(sine(1000, 3)).spectrumDb);
  expect(peak).toBeLessThanOrEqual(1);
  expect(peak).toBeGreaterThan(-12);
});

const white = (sec: number) => Float32Array.from({ length: SAMPLE_RATE * sec }, () => (random() * 2 - 1) * 0.3);
const brown = (sec: number) => {
  let v = 0;
  const out = Float32Array.from({ length: SAMPLE_RATE * sec }, () => (v = 0.995 * v + (random() * 2 - 1) * 0.05));
  return out;
};

test("white noise has a flat tone tilt", () => {
  expect(Math.abs(analyze(white(5)).tiltDbPerOct)).toBeLessThan(1);
});

test("brown noise tilts down about 6 dB per octave", () => {
  expect(Math.abs(analyze(brown(5)).tiltDbPerOct + 6)).toBeLessThan(1.5);
});

test("white noise has no harsh or muddy bump", () => {
  const r = analyze(white(5)).residual;
  expect(Math.abs(r.harsh)).toBeLessThan(2);
  expect(Math.abs(r.mud)).toBeLessThan(2);
});

test("silence before and after the sound is measured", () => {
  const s = new Float32Array(SAMPLE_RATE * 10);
  s.set(sine(440, 4, 0.5), SAMPLE_RATE * 3);
  const a = analyze(s);
  expect(Math.abs(a.leadSilenceSec - 3)).toBeLessThan(0.2);
  expect(Math.abs(a.trailSilenceSec - 3)).toBeLessThan(0.2);
});

test("white noise: presence, harsh and hiss are each about 10 dB above body", () => {
  const v = analyze(white(10)).vsBodyDb;
  expect(Math.abs(v.presence - 10)).toBeLessThan(1);
  expect(Math.abs(v.harsh - 10)).toBeLessThan(1);
  expect(Math.abs(v.hiss - 10.05)).toBeLessThan(1);
});

test("digital silence counts frames below -60 dBFS", () => {
  const s = new Float32Array(SAMPLE_RATE * 10);
  s.set(sine(440, 5, 0.5));
  expect(Math.abs(analyze(s).digitalSilencePct - 50)).toBeLessThan(2);
});

test("median active level of a -20 dBFS rms tone is about -20", () => {
  const amp = Math.pow(10, -20 / 20) * Math.SQRT2;
  expect(analyze(sine(440, 5, amp)).medianActiveDb).toBeCloseTo(-20, 0);
});
