import { analyze, compare, loudness, BANDS, SPEC_FREQS, SAMPLE_RATE, WEIGHTS } from "./analyze";
import { advise, rank, whyBest, TARGET_LUFS } from "./advice";

const MAX_SECONDS = 600;

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function hasVideo(file: File): Promise<boolean> {
  if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) return false;
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = url;
    await new Promise((done) => {
      v.onloadedmetadata = done;
      v.onerror = done;
      setTimeout(done, 5000);
    });
    return v.videoWidth > 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function study(file: File) {
  let buffer: AudioBuffer;
  try {
    buffer = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`"${file.name}" could not be decoded. Use MP3, MP4 with AAC audio, M4A or WAV.`);
  }
  await nextFrame();
  const length = Math.min(buffer.length, SAMPLE_RATE * MAX_SECONDS);
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) =>
    buffer.getChannelData(c).subarray(0, length),
  );
  const mono = channels.length === 1 ? channels[0] : channels[0].map((v, i) => (v + channels[1][i]) / 2);
  const video = await hasVideo(file);
  const analysis = analyze(mono);
  await nextFrame();
  const loud = loudness(channels.length === 1 ? [channels[0], channels[0]] : channels);
  return {
    name: file.name,
    sizeBytes: file.size,
    type: file.type || "unknown",
    channels: buffer.numberOfChannels,
    fullDurationSec: buffer.duration,
    hasVideo: video,
    bitrateKbps: video ? null : Math.round((file.size * 8) / Math.max(buffer.duration, 0.001) / 1000),
    analysis,
    loud,
  };
}

export type Studied = Awaited<ReturnType<typeof study>>;

const measures = (r: Studied) => ({
  lufs: r.loud.lufs,
  lra: r.loud.lra,
  peakDb: r.analysis.peakDb,
  clippingPct: r.analysis.clippingPct,
  tiltDbPerOct: r.analysis.tiltDbPerOct,
  residual: r.analysis.residual,
  leadSilenceSec: r.analysis.leadSilenceSec,
  trailSilenceSec: r.analysis.trailSilenceSec,
  bitrateKbps: r.bitrateKbps,
  vsBodyDb: r.analysis.vsBodyDb,
});

Object.assign(window, {
  SoundCompare: { study, compare, advise, rank, whyBest, measures, BANDS, SPEC_FREQS, WEIGHTS, MAX_SECONDS, TARGET_LUFS },
});
