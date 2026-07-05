import {
  REPLICATE_API_BASE,
  REPLICATE_API_TOKEN,
} from '@/lib/replicate-config';
import { buildMusicGenRenderPrompt } from '@/lib/lark-instruments';
import { briefToRenderPrompt } from '@/lib/production-brief';
import { humToneContextFromTranscription } from '@/lib/hum-tone-context';
import { gmPresetDisplayName } from '@/lib/nexus-gm-presets';
import { fetchAudioBlob, getAudioDurationMs } from '@/lib/elevenlabs-api';
import { isHumCleaningEnabled, resolveHumBlob } from '@/lib/hum-audio-prep';

/** Pinned meta/musicgen — stereo melody model with hum conditioning. */
const MUSICGEN_VERSION =
  '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';

const DATA_URI_MAX_BYTES = 256 * 1024;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

function apiHeaders({ json = true, forFileDownload = false } = {}) {
  const headers = {};
  if (REPLICATE_API_TOKEN) {
    headers.Authorization = `Bearer ${REPLICATE_API_TOKEN}`;
  }
  if (json && !forFileDownload) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function parseReplicateError(res) {
  let detail = res.statusText;
  try {
    const json = await res.json();
    detail = json?.detail ?? json?.title ?? json?.error ?? JSON.stringify(json);
  } catch {
    try {
      detail = await res.text();
    } catch {
      // keep statusText
    }
  }
  return detail;
}

async function blobToDataUri(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const mime = blob.type && blob.type !== 'application/octet-stream'
    ? blob.type
    : 'audio/wav';
  return `data:${mime};base64,${base64}`;
}

async function uploadReplicateFile(blob, filename = 'hum.webm') {
  const form = new FormData();
  form.append('content', blob, filename);
  form.append(
    'metadata',
    new Blob([JSON.stringify({ source: 'lark-hum' })], { type: 'application/json' }),
  );

  const res = await fetch(`${REPLICATE_API_BASE}/files`, {
    method: 'POST',
    headers: apiHeaders({ json: false }),
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Replicate upload (${res.status}): ${await parseReplicateError(res)}`);
  }

  const json = await res.json();
  const fileUrl = json?.urls?.get;
  if (!fileUrl) {
    throw new Error('Replicate upload did not return a file URL.');
  }
  return fileUrl;
}

async function resolveInputAudio(sourceUrl, blob) {
  if (sourceUrl?.startsWith('https://')) {
    return sourceUrl;
  }
  if (blob.size <= DATA_URI_MAX_BYTES) {
    return blobToDataUri(blob);
  }
  const ext = blob.type?.includes('webm') ? 'webm' : blob.type?.includes('mpeg') ? 'mp3' : 'wav';
  return uploadReplicateFile(blob, `hum.${ext}`);
}

function musicGenDurationSeconds(durationMs) {
  const humSeconds = Math.ceil((durationMs ?? 8000) / 1000);
  return Math.min(30, Math.max(12, humSeconds + 4));
}

async function createPrediction(input) {
  const res = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      version: MUSICGEN_VERSION,
      input,
    }),
  });

  if (!res.ok) {
    throw new Error(`Replicate (${res.status}): ${await parseReplicateError(res)}`);
  }

  return res.json();
}

async function waitForPrediction(predictionId, onProgress) {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const res = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
      headers: apiHeaders({ json: false }),
    });

    if (!res.ok) {
      throw new Error(`Replicate poll (${res.status}): ${await parseReplicateError(res)}`);
    }

    const prediction = await res.json();
    if (prediction.status === 'succeeded') {
      return prediction;
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error ?? `Replicate prediction ${prediction.status}.`);
    }

    onProgress?.('MusicGen is producing your track…');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Replicate timed out waiting for MusicGen.');
}

async function fetchPredictionOutput(outputUrl) {
  const res = await fetch(outputUrl, {
    headers: apiHeaders({ json: false, forFileDownload: true }),
  });
  if (!res.ok) {
    throw new Error(`Could not download MusicGen output (${res.status}).`);
  }
  const blob = await res.blob();
  if (!blob.size) {
    throw new Error('MusicGen returned empty audio.');
  }
  const type = blob.type && blob.type !== 'application/octet-stream'
    ? blob.type
    : 'audio/mpeg';
  return blob.type === type ? blob : new Blob([blob], { type });
}

/**
 * Hum-conditioned instrumental via Replicate meta/musicgen (melody mode).
 */
export async function renderInstrumentalFromHumReplicate({
  sourceUrl,
  sourceBlob,
  instrument,
  mood,
  gmPresetSlug = null,
  customPrompt = null,
  onProgress,
}) {
  if (!REPLICATE_API_TOKEN && !import.meta.env.DEV) {
    throw new Error('Replicate API token is not configured.');
  }

  const blob = await fetchAudioBlob(sourceUrl, sourceBlob);
  const durationMs = await getAudioDurationMs(blob);

  const prep = await resolveHumBlob(blob, { onProgress });
  const analysisBlob = prep.blob;

  let humContext = { bpm: null, noteCount: 0 };
  onProgress?.('Analyzing your hum…');
  try {
    const { transcribeHumToNotes } = await import('@/lib/hum-basic-pitch');
    const transcription = await transcribeHumToNotes(analysisBlob, {
      instrument,
      mood,
      cleanHum: false,
    });
    humContext = humToneContextFromTranscription(transcription);
  } catch {
    // MusicGen still uses the prepared hum audio for melody
  }

  onProgress?.('Uploading hum to MusicGen…');
  const inputAudio = await resolveInputAudio(
    prep.cleaned ? null : sourceUrl,
    analysisBlob,
  );
  const gmPresetName = gmPresetSlug ? gmPresetDisplayName(gmPresetSlug) : null;
  const prompt = customPrompt?.trim()
    ? briefToRenderPrompt(customPrompt, { instrument, mood })
    : buildMusicGenRenderPrompt({
      instrument,
      mood,
      humContext,
      gmPresetName,
    });
  const duration = musicGenDurationSeconds(durationMs);

  onProgress?.('Rendering with MusicGen (melody from your hum)…');
  const prediction = await createPrediction({
    model_version: 'stereo-melody-large',
    prompt,
    input_audio: inputAudio,
    duration,
    continuation: false,
    output_format: 'mp3',
  });

  const finished = await waitForPrediction(prediction.id, onProgress);
  const outputUrl = typeof finished.output === 'string'
    ? finished.output
    : finished.output?.[0];

  if (!outputUrl) {
    throw new Error('MusicGen returned no audio URL.');
  }

  const audioBlob = await fetchPredictionOutput(outputUrl);

  return {
    id: `render-${Date.now()}`,
    label: 'Your instrumental',
    blob: audioBlob,
    url: URL.createObjectURL(audioBlob),
    prompt,
    humContext,
    durationMs: duration * 1000,
    provider: 'replicate',
    providerLabel: 'MusicGen',
    cleaned: prep.cleaned,
    cleanStats: prep.stats,
  };
}
