const MAX_PREP_SEC = 45;
const HIGHPASS_HZ = 100;
const TARGET_PEAK = 0.9;

const HUM_CLEAN_STORAGE_KEY = 'lark-clean-hum';

export function isHumCleaningEnabled() {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(HUM_CLEAN_STORAGE_KEY) !== 'false';
}

export function setHumCleaningEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(HUM_CLEAN_STORAGE_KEY, enabled ? 'true' : 'false');
}

function mixToMono(decoded, maxSamples) {
  const length = Math.min(decoded.length, maxSamples);
  const mono = new Float32Array(length);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / decoded.numberOfChannels;
    }
  }
  return mono;
}

/** Second-order high-pass (rumble / handling noise). */
function highPass(samples, sampleRate, cutoffHz) {
  const out = new Float32Array(samples.length);
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos = Math.cos(omega);
  const sin = Math.sin(omega);
  const alpha = sin / (2 * 0.707);
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return out;
}

function frameRmsValues(samples, frameSize) {
  const values = [];
  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      sum += samples[i + j] ** 2;
    }
    values.push(Math.sqrt(sum / frameSize));
  }
  return values.length ? values : [0.001];
}

function peakAbs(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak || 0.001;
}

function softGate(samples, threshold, sampleRate) {
  const out = new Float32Array(samples.length);
  const attack = Math.exp(-1 / (sampleRate * 0.004));
  const release = Math.exp(-1 / (sampleRate * 0.06));
  let envelope = 0;

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    const coeff = abs > envelope ? attack : release;
    envelope = coeff * envelope + (1 - coeff) * abs;
    const ratio = envelope / threshold;
    const gain = ratio < 1 ? ratio * ratio : 1;
    out[i] = samples[i] * gain;
  }

  return out;
}

function trimSilence(samples, threshold) {
  let start = 0;
  let end = samples.length;

  while (start < end && Math.abs(samples[start]) < threshold) start += 1;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end -= 1;

  const pad = Math.min(400, Math.floor(samples.length * 0.02));
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);

  if (end - start < 256) {
    return { samples, start: 0, end: samples.length };
  }

  return {
    samples: samples.subarray(start, end),
    start,
    end,
  };
}

function normalizePeak(samples, targetPeak) {
  const peak = peakAbs(samples);
  if (peak <= 0.0001) return samples;
  const gain = targetPeak / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  }
  return out;
}

export function float32ToWavBlob(samples, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Light hum prep: high-pass, soft gate, trim silence, normalize.
 * Returns WAV for reliable downstream analysis / MusicGen upload.
 */
export async function prepareHumAudio(blob, { enabled = true } = {}) {
  if (!enabled || !blob?.size) {
    return { blob, cleaned: false, stats: null };
  }

  const arrayBuffer = await blob.arrayBuffer();
  const probe = new AudioContext();
  let decoded;
  try {
    decoded = await probe.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    await probe.close();
    return { blob, cleaned: false, stats: null };
  }
  await probe.close();

  const sampleRate = decoded.sampleRate;
  const maxSamples = Math.min(decoded.length, Math.ceil(MAX_PREP_SEC * sampleRate));
  const mono = mixToMono(decoded, maxSamples);
  const filtered = highPass(mono, sampleRate, HIGHPASS_HZ);

  const frameSize = Math.max(256, Math.floor(sampleRate * 0.02));
  const rmsFrames = frameRmsValues(filtered, frameSize).sort((a, b) => a - b);
  const noiseFloor = rmsFrames[Math.floor(rmsFrames.length * 0.12)] ?? 0.001;
  const peakBefore = peakAbs(filtered);
  const threshold = Math.max(noiseFloor * 2.8, peakBefore * 0.018);

  const gated = softGate(filtered, threshold, sampleRate);
  const { samples: trimmed, start, end } = trimSilence(gated, threshold * 0.75);
  const normalized = normalizePeak(trimmed, TARGET_PEAK);
  const peakAfter = peakAbs(normalized);

  if (normalized.length < sampleRate * 0.25) {
    return { blob, cleaned: false, stats: null };
  }

  const wavBlob = float32ToWavBlob(normalized, sampleRate);

  return {
    blob: wavBlob,
    cleaned: true,
    stats: {
      trimmedStartMs: Math.round((start / sampleRate) * 1000),
      trimmedEndMs: Math.round(((filtered.length - end) / sampleRate) * 1000),
      noiseFloorDb: Math.round(20 * Math.log10(noiseFloor + 1e-9)),
      peakBeforeDb: Math.round(20 * Math.log10(peakBefore + 1e-9)),
      peakAfterDb: Math.round(20 * Math.log10(peakAfter + 1e-9)),
    },
  };
}

/** Resolve blob for analysis / MusicGen — cleaned when enabled. */
export async function resolveHumBlob(blob, { onProgress, enabled } = {}) {
  const cleanEnabled = enabled ?? isHumCleaningEnabled();
  if (!cleanEnabled) {
    return { blob, cleaned: false, stats: null };
  }

  onProgress?.('Cleaning hum…');
  return prepareHumAudio(blob, { enabled: true });
}
