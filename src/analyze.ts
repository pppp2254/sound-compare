
export const SAMPLE_RATE = 22050;
const FRAME = 2048;
const HOP = 512;
const FRAME_RATE = SAMPLE_RATE / HOP;
const SILENCE_DB = -50;
const DIGITAL_SILENCE_DB = -60;
const MIN_TEMPO_CONFIDENCE = 0.2;
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const BANDS: [string, number, number][] = [
  ["Sub bass (20-60 Hz)", 20, 60],
  ["Bass (60-250 Hz)", 60, 250],
  ["Low mid (250-500 Hz)", 250, 500],
  ["Mid (500-2000 Hz)", 500, 2000],
  ["Upper mid (2-4 kHz)", 2000, 4000],
  ["Presence (4-6 kHz)", 4000, 6000],
  ["Brilliance (6-11 kHz)", 6000, 11025],
];

const SPEC_POINTS = 48;
export const SPEC_FREQS = Array.from(
  { length: SPEC_POINTS },
  (_, i) => 30 * Math.pow(10000 / 30, i / (SPEC_POINTS - 1)),
);

const ENVELOPE_POINTS = 300;

export type Analysis = {
  durationSec: number;
  peakDb: number;
  rmsDb: number;
  crestDb: number;
  dynamicRangeDb: number;
  silencePct: number;
  clippingPct: number;
  centroidHz: number;
  rolloffHz: number;
  zeroCrossingsPerSec: number;
  bandsPct: number[];
  bpm: number;
  bpmConfidence: number;
  key: string;
  keyConfidence: number;
  chroma: number[];
  spectrumDb: number[];
  envelopeDb: number[];
  frameDb: number[];
  tiltDbPerOct: number;
  residual: { boom: number; mud: number; harsh: number; air: number };
  leadSilenceSec: number;
  trailSilenceSec: number;
  vsBodyDb: { presence: number; harsh: number; hiss: number };
  digitalSilencePct: number;
  medianActiveDb: number;
};

const db = (power: number) => (power > 1e-20 ? 10 * Math.log10(power) : -200);

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const round = (x: number, digits = 2) => Number(x.toFixed(digits));

function estimateTempo(onset: number[]): { bpm: number; confidence: number } {
  const n = onset.length;
  const mean = onset.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const o = onset.map((_, i) => {
    const a = onset[i - 1] ?? onset[i], b = onset[i], c = onset[i + 1] ?? onset[i];
    return (a + 2 * b + c) / 4 - mean;
  });
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
    return s;
  };
  const zero = ac(0);
  if (zero <= 0) return { bpm: 0, confidence: 0 };
  const minLag = Math.floor((60 * FRAME_RATE) / 200);
  const maxLag = Math.ceil((60 * FRAME_RATE) / 60);
  const values: number[] = [];
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    values[lag] = ac(lag);
    if (values[lag] > values[best]) best = lag;
  }
  const half = Math.round(best / 2);
  if (half >= minLag && values[half] >= 0.6 * values[best]) best = half;
  const l = values[best - 1] ?? values[best], c = values[best], r = values[best + 1] ?? values[best];
  const denom = l - 2 * c + r;
  const shift = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
  const lag = best + Math.max(-0.5, Math.min(0.5, shift));
  const confidence = Math.max(0, c / zero);
  if (confidence < MIN_TEMPO_CONFIDENCE) return { bpm: 0, confidence };
  return { bpm: (60 * FRAME_RATE) / lag, confidence };
}

function estimateKey(chroma: number[]): { key: string; confidence: number } {
  let best = { key: "Unknown", confidence: 0 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [profile, mode] of [[MAJOR, "major"], [MINOR, "minor"]] as const) {
      const rotated = chroma.map((_, i) => profile[(i - tonic + 12) % 12]);
      const r = pearson(chroma, rotated);
      if (r > best.confidence) best = { key: `${PITCH_NAMES[tonic]} ${mode}`, confidence: r };
    }
  }
  return best;
}

const CHROMA_FRAME = 8192;
function chromaProfile(samples: Float32Array): number[] {
  const bins = CHROMA_FRAME / 2 + 1;
  const binHz = SAMPLE_RATE / CHROMA_FRAME;
  const pitchClass = new Int8Array(bins).fill(-1);
  const noteOf = new Int16Array(bins);
  const binsPerNote = new Map<number, number>();
  for (let k = 1; k < bins; k++) {
    const f = k * binHz;
    if (f >= 110 && f <= 5000) {
      const midi = Math.round(69 + 12 * Math.log2(f / 440));
      noteOf[k] = midi;
      pitchClass[k] = ((midi % 12) + 12) % 12;
      binsPerNote.set(midi, (binsPerNote.get(midi) ?? 0) + 1);
    }
  }
  const window = new Float64Array(CHROMA_FRAME);
  for (let i = 0; i < CHROMA_FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (CHROMA_FRAME - 1));
  const chroma = new Array(12).fill(0);
  const re = new Float64Array(CHROMA_FRAME);
  const im = new Float64Array(CHROMA_FRAME);
  const last = Math.max(0, samples.length - CHROMA_FRAME);
  for (let start = 0; start <= last; start += CHROMA_FRAME / 2) {
    for (let i = 0; i < CHROMA_FRAME; i++) {
      re[i] = (samples[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < bins; k++)
      if (pitchClass[k] >= 0) chroma[pitchClass[k]] += Math.hypot(re[k], im[k]) / binsPerNote.get(noteOf[k])!;
  }
  return chroma;
}

function kWeight(x: Float32Array, fs: number): Float64Array {
  const biquad = (input: ArrayLike<number>, b: number[], a: number[]) => {
    const out = new Float64Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const x0 = input[i];
      const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
      out[i] = y0;
    }
    return out;
  };
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  const Q1 = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q1 + K * K;
  const shelf = biquad(
    x,
    [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0],
    [1, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0],
  );
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  return biquad(shelf, [1, -2, 1], [1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0]);
}

const toLufs = (meanSquare: number) => (meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -200);

export function loudness(channels: Float32Array[]): { lufs: number; lra: number } {
  const seg = Math.round(SAMPLE_RATE / 10);
  const steps: number[] = [];
  for (const ch of channels.slice(0, 2)) {
    const w = kWeight(ch, SAMPLE_RATE);
    for (let s = 0; (s + 1) * seg <= w.length; s++) {
      let e = 0;
      for (let i = s * seg; i < (s + 1) * seg; i++) e += w[i] * w[i];
      steps[s] = (steps[s] ?? 0) + e;
    }
  }
  const windows = (n: number) => {
    const out: number[] = [];
    for (let s = 0; s + n <= steps.length; s++) {
      let e = 0;
      for (let k = s; k < s + n; k++) e += steps[k];
      out.push(e / (n * seg));
    }
    return out;
  };
  const blocks = windows(4).filter((z) => toLufs(z) > -70);
  const mean = (z: number[]) => z.reduce((a, b) => a + b, 0) / Math.max(1, z.length);
  const relGate = toLufs(mean(blocks)) - 10;
  const gated = blocks.filter((z) => toLufs(z) > relGate);
  const lufs = gated.length ? toLufs(mean(gated)) : -200;
  const short = windows(30).filter((z) => toLufs(z) > -70);
  const shortGate = toLufs(mean(short)) - 20;
  const kept = short.filter((z) => toLufs(z) > shortGate).map(toLufs).sort((a, b) => a - b);
  const lra = kept.length > 1 ? percentile(kept, 0.95) - percentile(kept, 0.1) : 0;
  return { lufs: round(Math.max(-200, lufs), 1), lra: round(lra, 1) };
}

function toneShape(spectrumDb: number[]) {
  const pts = SPEC_FREQS.map((f, i) => [Math.log2(f), spectrumDb[i]] as const).filter(
    ([x]) => x >= Math.log2(100) && x <= Math.log2(8000),
  );
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const line = (f: number) => my + slope * (Math.log2(f) - mx);
  const gap = (lo: number, hi: number) => {
    const g = SPEC_FREQS.map((f, i) => [f, spectrumDb[i] - line(f)] as const).filter(([f]) => f >= lo && f <= hi);
    return g.length ? g.reduce((s, [, v]) => s + v, 0) / g.length : 0;
  };
  return {
    tiltDbPerOct: slope,
    residual: { boom: gap(40, 100), mud: gap(200, 500), harsh: gap(2000, 5000), air: gap(8000, 10000) },
  };
}

export function analyze(input: Float32Array): Analysis {
  const samples = input.length >= FRAME ? input : (() => {
    const p = new Float32Array(FRAME);
    p.set(input);
    return p;
  })();
  const n = input.length;
  const bins = FRAME / 2 + 1;
  const binHz = SAMPLE_RATE / FRAME;

  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

  const avgPower = new Float64Array(bins);
  const frameDb: number[] = [];
  const onset: number[] = [];
  let prevMag = new Float64Array(bins);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  let frames = 0;

  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    let sq = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[start + i];
      sq += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    frameDb.push(db(sq / FRAME));
    fft(re, im);
    const mag = new Float64Array(bins);
    let flux = 0;
    for (let k = 0; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      avgPower[k] += p;
      mag[k] = Math.sqrt(p);
      const rise = mag[k] - prevMag[k];
      if (rise > 0) flux += rise;
    }
    onset.push(flux);
    prevMag = mag;
    frames++;
  }
  let windowSum = 0;
  for (let i = 0; i < FRAME; i++) windowSum += window[i];
  const scale = Math.max(1, frames) * (windowSum / 2) ** 2;
  for (let k = 0; k < bins; k++) avgPower[k] /= scale;

  let peak = 0, sumSq = 0, crossings = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const s = input[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sumSq += s * s;
    if (i > 0 && (input[i - 1] < 0) !== (s < 0)) crossings++;
  }
  const durationSec = n / SAMPLE_RATE;
  const peakDb = db(peak * peak);
  const rmsDb = db(sumSq / Math.max(1, n));

  let total = 0, weighted = 0;
  for (let k = 1; k < bins; k++) { total += avgPower[k]; weighted += avgPower[k] * k * binHz; }
  const centroidHz = total > 0 ? weighted / total : 0;
  let acc = 0, rolloffHz = 0;
  for (let k = 1; k < bins; k++) {
    acc += avgPower[k];
    if (acc >= 0.85 * total) { rolloffHz = k * binHz; break; }
  }
  const bandsPct = BANDS.map(([, lo, hi]) => {
    let e = 0;
    for (let k = 1; k < bins; k++) { const f = k * binHz; if (f >= lo && f < hi) e += avgPower[k]; }
    return total > 0 ? (100 * e) / total : 0;
  });
  const spectrumDb = SPEC_FREQS.map((f, i) => {
    const lo = i === 0 ? f / 1.1 : Math.sqrt(SPEC_FREQS[i - 1] * f);
    const hi = i === SPEC_POINTS - 1 ? f * 1.1 : Math.sqrt(SPEC_FREQS[i + 1] * f);
    let e = 0, c = 0;
    for (let k = 1; k < bins; k++) { const fk = k * binHz; if (fk >= lo && fk < hi) { e += avgPower[k]; c++; } }
    if (c === 0) { e = avgPower[Math.min(bins - 1, Math.round(f / binHz))]; c = 1; }
    return db(e / c);
  });

  const loud = frameDb.filter((d) => d > SILENCE_DB).sort((a, b) => a - b);
  const dynamicRangeDb = loud.length ? percentile(loud, 0.95) - percentile(loud, 0.1) : 0;
  const silencePct = frameDb.length ? (100 * (frameDb.length - loud.length)) / frameDb.length : 100;
  const group = Math.max(1, Math.ceil(frameDb.length / ENVELOPE_POINTS));
  const envelopeDb: number[] = [];
  for (let i = 0; i < frameDb.length; i += group) {
    const part = frameDb.slice(i, i + group);
    const meanPower = part.reduce((s, d) => s + Math.pow(10, d / 10), 0) / part.length;
    envelopeDb.push(round(Math.max(-90, db(meanPower)), 1));
  }

  const chroma = chromaProfile(samples);
  const chromaMax = Math.max(...chroma);
  const chromaNorm = chroma.map((v) => (chromaMax > 0 ? v / chromaMax : 0));
  const bandEnergy = (lo: number, hi: number) => {
    let e = 0;
    for (let k = 1; k < bins; k++) { const f = k * binHz; if (f >= lo && f < hi) e += avgPower[k]; }
    return e;
  };
  const body = bandEnergy(200, 500);
  const vsBody = (lo: number, hi: number) => db(bandEnergy(lo, hi)) - db(body);
  const vsBodyDb = { presence: vsBody(2000, 5000), harsh: vsBody(5000, 8000), hiss: vsBody(8000, 11026) };
  const digitalSilencePct = frameDb.length
    ? (100 * frameDb.filter((d) => d < DIGITAL_SILENCE_DB).length) / frameDb.length
    : 100;
  const medianActiveDb = loud.length ? loud[Math.floor(loud.length / 2)] : -200;
  const tempo = estimateTempo(onset);
  const shape = toneShape(spectrumDb);
  const firstLoud = frameDb.findIndex((d) => d > SILENCE_DB);
  const lastLoud = frameDb.length - 1 - [...frameDb].reverse().findIndex((d) => d > SILENCE_DB);
  const leadSilenceSec = firstLoud < 0 ? durationSec : (firstLoud * HOP) / SAMPLE_RATE;
  const trailSilenceSec = firstLoud < 0 ? 0 : Math.max(0, durationSec - (lastLoud * HOP + FRAME) / SAMPLE_RATE);
  const key = estimateKey(chromaNorm);

  return {
    durationSec: round(durationSec),
    peakDb: round(Math.max(-200, peakDb)),
    rmsDb: round(Math.max(-200, rmsDb)),
    crestDb: round(peakDb - rmsDb),
    dynamicRangeDb: round(dynamicRangeDb),
    silencePct: round(silencePct, 1),
    clippingPct: round((100 * clipped) / Math.max(1, n), 3),
    centroidHz: round(centroidHz, 0),
    rolloffHz: round(rolloffHz, 0),
    zeroCrossingsPerSec: round(crossings / Math.max(durationSec, 1e-9), 0),
    bandsPct: bandsPct.map((v) => round(v, 1)),
    bpm: round(tempo.bpm, 1),
    bpmConfidence: round(tempo.confidence),
    key: key.key,
    keyConfidence: round(key.confidence),
    chroma: chromaNorm.map((v) => round(v, 3)),
    spectrumDb: spectrumDb.map((v) => round(Math.max(-120, v), 1)),
    envelopeDb,
    frameDb,
    tiltDbPerOct: round(shape.tiltDbPerOct, 1),
    residual: {
      boom: round(shape.residual.boom, 1),
      mud: round(shape.residual.mud, 1),
      harsh: round(shape.residual.harsh, 1),
      air: round(shape.residual.air, 1),
    },
    leadSilenceSec: round(leadSilenceSec, 1),
    trailSilenceSec: round(trailSilenceSec, 1),
    vsBodyDb: {
      presence: round(Math.max(-120, Math.min(120, vsBodyDb.presence)), 1),
      harsh: round(Math.max(-120, Math.min(120, vsBodyDb.harsh)), 1),
      hiss: round(Math.max(-120, Math.min(120, vsBodyDb.hiss)), 1),
    },
    digitalSilencePct: round(digitalSilencePct, 1),
    medianActiveDb: round(Math.max(-200, medianActiveDb), 1),
  };
}

function tempoSimilarity(a: number, b: number) {
  if (a <= 0 || b <= 0) return 0;
  const best = Math.min(...[b, b * 2, b / 2].map((c) => Math.abs(Math.log2(a / c))));
  return Math.max(0, 1 - best * 4);
}

function bestAlignment(a: number[], b: number[], maxShiftSec: number) {
  const step = 4;
  const x = a.filter((_, i) => i % step === 0);
  const y = b.filter((_, i) => i % step === 0);
  const rate = FRAME_RATE / step;
  const maxShift = Math.min(Math.round(maxShiftSec * rate), Math.max(x.length, y.length) - 2);
  let best = { r: 0, offsetSec: 0 };
  for (let s = -maxShift; s <= maxShift; s++) {
    const xs = s >= 0 ? x.slice(s) : x;
    const ys = s >= 0 ? y : y.slice(-s);
    const len = Math.min(xs.length, ys.length);
    if (len < Math.max(10, 0.5 * Math.min(x.length, y.length))) continue;
    const r = pearson(xs.slice(0, len), ys.slice(0, len));
    if (r > best.r) best = { r, offsetSec: s / rate };
  }
  return best;
}

export const WEIGHTS = { spectrum: 0.35, harmony: 0.25, loudnessShape: 0.25, tempo: 0.15 };

export function compare(a: Analysis, b: Analysis) {
  const spectrum = Math.max(0, pearson(a.spectrumDb, b.spectrumDb));
  const harmony = Math.max(0, pearson(a.chroma, b.chroma));
  const align = bestAlignment(a.frameDb, b.frameDb, 30);
  const tempo = a.bpm > 0 && b.bpm > 0 ? tempoSimilarity(a.bpm, b.bpm) : null;
  const tempoWeight = tempo === null ? 0 : WEIGHTS.tempo;
  const overall =
    (WEIGHTS.spectrum * spectrum +
      WEIGHTS.harmony * harmony +
      WEIGHTS.loudnessShape * align.r +
      tempoWeight * (tempo ?? 0)) /
    (WEIGHTS.spectrum + WEIGHTS.harmony + WEIGHTS.loudnessShape + tempoWeight);
  return {
    overallPct: round(100 * overall, 1),
    spectrumPct: round(100 * spectrum, 1),
    harmonyPct: round(100 * harmony, 1),
    loudnessShapePct: round(100 * align.r, 1),
    tempoPct: tempo === null ? null : round(100 * tempo, 1),
    bestOffsetSec: round(align.offsetSec, 2),
    sameKey: a.key === b.key,
    loudnessDiffDb: round(b.rmsDb - a.rmsDb),
    durationDiffSec: round(b.durationSec - a.durationSec),
  };
}
