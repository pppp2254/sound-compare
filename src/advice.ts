
export type Content = "music" | "speech";
export type Lang = "en" | "th";
export type Level = "ok" | "minor" | "major";

export type Measures = {
  lufs: number;
  lra: number;
  peakDb: number;
  clippingPct: number;
  tiltDbPerOct: number;
  residual: { boom: number; mud: number; harsh: number; air: number };
  leadSilenceSec: number;
  trailSilenceSec: number;
  bitrateKbps: number | null;
  vsBodyDb: { presence: number; harsh: number; hiss: number };
};

export type Item = { area: string; label: string; level: Level; detail: string; change: string; penalty: number };
export type Advice = { score: number; target: number; items: Item[] };

export const TARGET_LUFS: Record<Content, number> = { music: -14, speech: -16 };
const IDEAL_TILT = -4.5;
const PEAK_LIMIT = -1;
const SIBILANCE_LIMIT = -15;
const HISS_LIMIT = -18;

const f1 = (x: number) => Math.abs(x).toFixed(1);

const TEXT = {
  en: {
    label: {
      Volume: "Volume", Peaks: "Peaks", Clipping: "Clipping", Dynamics: "Dynamics",
      "Tone balance": "Tone balance", Harshness: "Harshness", Muddiness: "Muddiness",
      Boom: "Boom", Silence: "Silence", Quality: "Quality", Sibilance: "Sibilance", Hiss: "Hiss",
    } as Record<string, string>,
    volOk: (l: number, t: number) => `${l} LUFS is close to the ${t} LUFS target.`,
    volOff: (l: number, d: number, up: boolean, t: number) => `${l} LUFS is ${f1(d)} dB ${up ? "below" : "above"} the ${t} LUFS target.`,
    volLimiter: (p: string) => ` Raising it would push peaks to ${p} dBFS, so use a limiter set to ${PEAK_LIMIT} dBFS.`,
    volChange: (d: number, up: boolean) => `${up ? "Raise" : "Lower"} volume by ${f1(d)} dB`,
    peakBad: (p: number) => `Peaks reach ${p} dBFS. Above ${PEAK_LIMIT} dBFS they can distort on phones and after conversion.`,
    peakChange: `Limit peaks to ${PEAK_LIMIT} dBFS`,
    peakOk: (p: number) => `Peaks stay at ${p} dBFS, below ${PEAK_LIMIT} dBFS.`,
    clipMajor: (c: number) => `${c}% of samples are clipped, which sounds like crackle or distortion. It cannot be fully undone.`,
    clipMajorChange: "Export again from the source at a lower level",
    clipMinor: (c: number) => `A few samples (${c}%) touch full scale.`,
    clipMinorChange: "Lower the level slightly",
    clipOk: "No clipped samples.",
    dynLow: (r: number) => `Loudness range is only ${r} LU. Very little change between loud and quiet parts can feel tiring.`,
    dynLowChange: "Use less compression",
    dynHigh: (r: number) => `Loudness range is ${r} LU. Quiet parts may be hard to hear when loud parts are at a comfortable level.`,
    dynHighChange: "Use gentle compression",
    dynOk: (r: number) => `Loudness range ${r} LU is comfortable.`,
    bright: "Treble is strong compared with bass, which can sound thin or sharp.",
    dull: "Treble is weak compared with bass, which can sound dull or muffled.",
    toneChange: (bright: boolean, x: string) => `${bright ? "Lower" : "Raise"} treble above 4 kHz by about ${x} dB`,
    toneOk: "Bass and treble are in a normal balance.",
    bumpMeasured: (v: string) => ` Measured ${v} dB above the overall curve.`,
    bumpChange: (range: string, x: string) => `Cut ${range} by about ${x} dB`,
    harsh: "Extra energy at 2-5 kHz, where the ear is most sensitive. This is the main cause of listening fatigue.",
    mud: "Extra energy at 200-500 Hz can make sound boxy and unclear.",
    boom: "Very strong deep bass can rumble and hide other sounds.",
    below100: "below 100 Hz",
    silence: "Long silence makes listeners think nothing is playing.",
    silStart: (s: string) => `${s} s at the start`,
    silEnd: (s: string) => `${s} s at the end`,
    silChange: (parts: string[]) => `Trim ${parts.join(" and ")}`,
    quality: (k: number) => `About ${k} kbps. Low bitrates can sound smeared or watery.`,
    qualityChange: "Export at 192 kbps or higher",
    sibilance: (v: string) => `5-8 kHz is ${v} dB against the body. Sharp "s" and "t" sounds can sting at high volume.`,
    sibilanceChange: (x: string) => `Use a de-esser, or cut 5-8 kHz by about ${x} dB`,
    hiss: (v: string) => `Above 8 kHz is ${v} dB against the body. This is usually noise or hiss, which tires the ears over time.`,
    hissChange: (x: string) => `Use noise reduction, or lower above 8 kHz by about ${x} dB`,
  },
  th: {
    label: {
      Volume: "ความดัง", Peaks: "ยอดสัญญาณ", Clipping: "เสียงแตก", Dynamics: "ช่วงความดัง",
      "Tone balance": "สมดุลทุ้มแหลม", Harshness: "เสียงบาดหู", Muddiness: "เสียงอับ",
      Boom: "เสียงทุ้มล้น", Silence: "ช่วงเงียบ", Quality: "คุณภาพไฟล์", Sibilance: "เสียงซี่ฟัน", Hiss: "เสียงซ่า",
    } as Record<string, string>,
    volOk: (l: number, t: number) => `${l} LUFS ใกล้เป้าหมาย ${t} LUFS แล้ว`,
    volOff: (l: number, d: number, up: boolean, t: number) => `${l} LUFS ${up ? "ต่ำกว่า" : "สูงกว่า"}เป้าหมาย ${t} LUFS อยู่ ${f1(d)} dB`,
    volLimiter: (p: string) => ` ถ้าเพิ่มความดัง ยอดสัญญาณจะขึ้นไปถึง ${p} dBFS ควรใช้ลิมิตเตอร์ตั้งไว้ที่ ${PEAK_LIMIT} dBFS`,
    volChange: (d: number, up: boolean) => `${up ? "เพิ่ม" : "ลด"}ความดัง ${f1(d)} dB`,
    peakBad: (p: number) => `ยอดสัญญาณขึ้นถึง ${p} dBFS ถ้าเกิน ${PEAK_LIMIT} dBFS อาจแตกเมื่อเล่นบนมือถือหรือหลังแปลงไฟล์`,
    peakChange: `จำกัดยอดสัญญาณไว้ที่ ${PEAK_LIMIT} dBFS`,
    peakOk: (p: number) => `ยอดสัญญาณสูงสุด ${p} dBFS ไม่เกิน ${PEAK_LIMIT} dBFS`,
    clipMajor: (c: number) => `สัญญาณ ${c}% ถูกตัดยอด ได้ยินเป็นเสียงแตกหรือแตกพร่า และแก้กลับไม่ได้ทั้งหมด`,
    clipMajorChange: "Export ใหม่จากต้นฉบับโดยลดระดับลง",
    clipMinor: (c: number) => `มีบางจุด (${c}%) แตะระดับสูงสุด`,
    clipMinorChange: "ลดระดับลงเล็กน้อย",
    clipOk: "ไม่มีเสียงแตก",
    dynLow: (r: number) => `ช่วงความดังแคบเพียง ${r} LU ดังเท่ากันเกือบตลอด ฟังนานอาจเหนื่อยหู`,
    dynLowChange: "ลดการใช้คอมเพรสเซอร์",
    dynHigh: (r: number) => `ช่วงความดังกว้างถึง ${r} LU ถ้าตั้งช่วงดังให้พอดี ช่วงเบาอาจได้ยินไม่ชัด`,
    dynHighChange: "ใช้คอมเพรสเซอร์แบบเบาๆ",
    dynOk: (r: number) => `ช่วงความดัง ${r} LU ฟังสบาย`,
    bright: "เสียงแหลมเด่นกว่าเสียงทุ้ม อาจฟังบางหรือแสบหู",
    dull: "เสียงแหลมน้อยเมื่อเทียบกับเสียงทุ้ม อาจฟังทึบหรืออู้อี้",
    toneChange: (bright: boolean, x: string) => `${bright ? "ลด" : "เพิ่ม"}เสียงแหลมเหนือ 4 kHz ประมาณ ${x} dB`,
    toneOk: "เสียงทุ้มและแหลมสมดุลปกติ",
    bumpMeasured: (v: string) => ` วัดได้สูงกว่าเส้นรวม ${v} dB`,
    bumpChange: (range: string, x: string) => `ลดช่วง ${range} ลงประมาณ ${x} dB`,
    harsh: "พลังงานเกินที่ 2-5 kHz ซึ่งหูไวที่สุด เป็นสาเหตุหลักที่ทำให้ฟังแล้วเหนื่อยหู",
    mud: "พลังงานเกินที่ 200-500 Hz ทำให้เสียงอับและไม่ชัด",
    boom: "เสียงทุ้มลึกแรงเกิน อาจกระหึ่มและกลบเสียงอื่น",
    below100: "ต่ำกว่า 100 Hz",
    silence: "ช่วงเงียบยาวทำให้ผู้ฟังคิดว่าเสียงไม่เล่น",
    silStart: (s: string) => `${s} วินาทีตอนต้น`,
    silEnd: (s: string) => `${s} วินาทีตอนท้าย`,
    silChange: (parts: string[]) => `ตัดช่วงเงียบ ${parts.join(" และ ")}`,
    quality: (k: number) => `ประมาณ ${k} kbps บิตเรตต่ำอาจทำให้เสียงฟุ้งไม่คม`,
    qualityChange: "Export ที่ 192 kbps ขึ้นไป",
    sibilance: (v: string) => `ย่าน 5-8 kHz อยู่ที่ ${v} dB เทียบช่วงหลัก เสียง "ส" และ "ท" อาจแสบหูเมื่อเปิดดัง`,
    sibilanceChange: (x: string) => `ใช้ de-esser หรือลดช่วง 5-8 kHz ลงประมาณ ${x} dB`,
    hiss: (v: string) => `ย่านเหนือ 8 kHz อยู่ที่ ${v} dB เทียบช่วงหลัก มักเป็นเสียงซ่าหรือนอยส์ ฟังนานจะเหนื่อยหู`,
    hissChange: (x: string) => `ใช้ noise reduction หรือลดย่านเหนือ 8 kHz ลงประมาณ ${x} dB`,
  },
};

export function advise(m: Measures, content: Content, lang: Lang = "en"): Advice {
  const T = TEXT[lang];
  const target = TARGET_LUFS[content];
  const items: Item[] = [];
  const add = (area: string, level: Level, detail: string, change = "", penalty = 0) =>
    items.push({ area, label: T.label[area], level, detail, change, penalty });

  const d = m.lufs - target;
  if (Math.abs(d) <= 1) {
    add("Volume", "ok", T.volOk(m.lufs, target));
  } else {
    const up = d < 0;
    const newPeak = m.peakDb - d;
    let detail = T.volOff(m.lufs, d, up, target);
    if (up && newPeak > PEAK_LIMIT) detail += T.volLimiter(newPeak.toFixed(1));
    add("Volume", Math.abs(d) > 4 ? "major" : "minor", detail, T.volChange(d, up), Math.min(30, 3 * (Math.abs(d) - 1)));
  }

  if (m.peakDb > PEAK_LIMIT) add("Peaks", "minor", T.peakBad(m.peakDb), T.peakChange, 5);
  else add("Peaks", "ok", T.peakOk(m.peakDb));

  if (m.clippingPct > 0.01)
    add("Clipping", "major", T.clipMajor(m.clippingPct), T.clipMajorChange, Math.min(30, 10 + 20 * m.clippingPct));
  else if (m.clippingPct > 0) add("Clipping", "minor", T.clipMinor(m.clippingPct), T.clipMinorChange, 3);
  else add("Clipping", "ok", T.clipOk);

  const maxLra = content === "music" ? 20 : 12;
  if (content === "music" && m.lra < 3) add("Dynamics", "minor", T.dynLow(m.lra), T.dynLowChange, 10);
  else if (m.lra > maxLra) add("Dynamics", "minor", T.dynHigh(m.lra), T.dynHighChange, 8);
  else add("Dynamics", "ok", T.dynOk(m.lra));

  const dev = m.tiltDbPerOct - IDEAL_TILT;
  if (Math.abs(dev) > 3) {
    const bright = dev > 0;
    const amount = Math.min(6, Math.abs(dev) * 2).toFixed(1);
    add("Tone balance", "minor", bright ? T.bright : T.dull, T.toneChange(bright, amount), Math.min(12, 2 * Math.abs(dev)));
  } else {
    add("Tone balance", "ok", T.toneOk);
  }

  const bump = (area: string, value: number, limit: number, detail: string, range: string) => {
    if (value > limit)
      add(area, "minor", detail + T.bumpMeasured(value.toFixed(1)), T.bumpChange(range, Math.min(6, value).toFixed(1)), Math.min(12, 2 * value));
  };
  bump("Harshness", m.residual.harsh, 3, T.harsh, "2-5 kHz");
  bump("Muddiness", m.residual.mud, 3, T.mud, "200-500 Hz");
  bump("Boom", m.residual.boom, 6, T.boom, T.below100);

  const sib = m.vsBodyDb.harsh - SIBILANCE_LIMIT;
  if (sib > 0)
    add("Sibilance", "minor", T.sibilance(m.vsBodyDb.harsh.toFixed(1)), T.sibilanceChange(Math.min(6, sib).toFixed(1)), Math.min(12, 3 + 1.5 * sib));
  const hiss = m.vsBodyDb.hiss - HISS_LIMIT;
  if (hiss > 0)
    add("Hiss", hiss > 6 ? "major" : "minor", T.hiss(m.vsBodyDb.hiss.toFixed(1)), T.hissChange(Math.min(6, hiss).toFixed(1)), Math.min(15, 4 + 2 * hiss));

  const trims: string[] = [];
  if (m.leadSilenceSec > 2) trims.push(T.silStart(m.leadSilenceSec.toFixed(1)));
  if (m.trailSilenceSec > 3) trims.push(T.silEnd(m.trailSilenceSec.toFixed(1)));
  if (trims.length) add("Silence", "minor", T.silence, T.silChange(trims), 3);

  if (m.bitrateKbps !== null && m.bitrateKbps < 128) add("Quality", "minor", T.quality(m.bitrateKbps), T.qualityChange, 5);

  const score = Math.max(0, Math.round(100 - items.reduce((s, i) => s + i.penalty, 0)));
  return { score, target, items };
}

export function rank(results: Advice[]) {
  const order = results.map((r, i) => i).sort((x, y) => results[y].score - results[x].score);
  const best = results[order[0]].score;
  const tied = order.filter((i) => best - results[i].score < 3);
  return { order, tied };
}

export function pickBetter(a: Advice, b: Advice) {
  const diff = a.score - b.score;
  if (Math.abs(diff) < 3) return { winner: "same" as const, reasons: [] as string[] };
  const [win, lose] = diff > 0 ? [a, b] : [b, a];
  const winBad = new Set(win.items.filter((i) => i.level !== "ok").map((i) => i.area));
  const reasons = lose.items
    .filter((i) => i.level !== "ok" && !winBad.has(i.area))
    .sort((x, y) => y.penalty - x.penalty)
    .map((i) => i.label);
  return { winner: diff > 0 ? ("A" as const) : ("B" as const), reasons };
}

export function whyBest(results: Advice[], best: number): string[] {
  const bestBad = new Set(results[best].items.filter((i) => i.level !== "ok").map((i) => i.area));
  const total = new Map<string, { label: string; penalty: number }>();
  results.forEach((r, k) => {
    if (k === best) return;
    for (const i of r.items) {
      if (i.level === "ok" || bestBad.has(i.area)) continue;
      const t = total.get(i.area) ?? { label: i.label, penalty: 0 };
      t.penalty += i.penalty;
      total.set(i.area, t);
    }
  });
  return [...total.values()].sort((a, b) => b.penalty - a.penalty).map((t) => t.label);
}
