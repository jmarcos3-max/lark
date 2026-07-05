import {
  ELEVENLABS_API_BASE,
  ELEVENLABS_API_KEY,
} from '@/lib/elevenlabs-config';
import {
  buildElevenLabsLayerPrompt,
  buildElevenLabsRenderPrompt,
  defaultWowPassLayerTypes,
  wowPassLayerDurationMs,
} from '@/lib/lark-instruments';
import { humToneContextFromTranscription } from '@/lib/hum-tone-context';
import { briefToRenderPrompt } from '@/lib/production-brief';
import { isHumCleaningEnabled, resolveHumBlob } from '@/lib/hum-audio-prep';
import { gmPresetDisplayName } from '@/lib/nexus-gm-presets';

function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (ELEVENLABS_API_KEY) {
    headers['xi-api-key'] = ELEVENLABS_API_KEY;
  }
  return headers;
}

export async function fetchAudioBlob(sourceUrl, existingBlob = null) {
  if (existingBlob instanceof Blob && existingBlob.size > 0) {
    return existingBlob;
  }
  if (!sourceUrl) {
    throw new Error('Record or import humming first.');
  }
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error('Could not load your recording.');
    }
    const blob = await res.blob();
    if (!blob?.size) {
      throw new Error('Recording is empty. Record or import again.');
    }
    return blob;
  } catch (err) {
    if (existingBlob instanceof Blob && existingBlob.size > 0) {
      return existingBlob;
    }
    const message = err instanceof Error ? err.message : 'Could not load your recording.';
    throw new Error(message);
  }
}

/** Duration in ms; falls back to 8s if metadata is missing. */
export function getAudioDurationMs(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      URL.revokeObjectURL(url);
      if (Number.isFinite(seconds) && seconds > 0) {
        resolve(Math.round(seconds * 1000));
      } else {
        resolve(8000);
      }
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(8000);
    };
    audio.src = url;
  });
}

/**
 * Generate a full produced instrumental (ElevenLabs Music API).
 * When `humContext` is provided, the prompt follows your analyzed hum.
 */
export async function composeInstrumentalFromHumming({
  instrument,
  mood,
  durationMs,
  humContext = null,
  gmPresetSlug = null,
  customPrompt = null,
}) {
  if (!ELEVENLABS_API_KEY && !import.meta.env.DEV) {
    throw new Error('ElevenLabs API key is not configured.');
  }

  const musicLengthMs = Math.min(
    120_000,
    Math.max(8_000, Math.round(durationMs ?? 12_000)),
  );
  const gmPresetName = gmPresetSlug ? gmPresetDisplayName(gmPresetSlug) : null;
  const prompt = customPrompt?.trim()
    ? briefToRenderPrompt(customPrompt, { instrument, mood })
    : buildElevenLabsRenderPrompt({
      instrument,
      mood,
      humContext,
      gmPresetName,
    });

  const url = `${ELEVENLABS_API_BASE}/v1/music?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      prompt,
      music_length_ms: musicLengthMs,
      model_id: 'music_v1',
      force_instrumental: true,
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json?.detail?.[0]?.msg ?? json?.message ?? JSON.stringify(json);
    } catch {
      try {
        detail = await res.text();
      } catch {
        // keep statusText
      }
    }
    throw new Error(`ElevenLabs (${res.status}): ${detail}`);
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error('ElevenLabs returned empty audio.');
  }
  const audioBlob = blob.type && blob.type !== 'application/octet-stream'
    ? blob
    : new Blob([blob], { type: 'audio/mpeg' });

  return { blob: audioBlob, prompt, musicLengthMs };
}

/**
 * Suno-style path: analyze hum → render one polished instrumental MP3.
 */
export async function renderInstrumentalFromHum({
  sourceUrl,
  sourceBlob,
  instrument,
  mood,
  gmPresetSlug = null,
  customPrompt = null,
  onProgress,
}) {
  const blob = await fetchAudioBlob(sourceUrl, sourceBlob);
  const prep = await resolveHumBlob(blob, { onProgress, enabled: isHumCleaningEnabled() });
  const analysisBlob = prep.blob;
  const durationMs = await getAudioDurationMs(analysisBlob);

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
    // Render still works with mood + instrument only
  }

  onProgress?.('Rendering instrumental…');
  const { blob: audioBlob, prompt, musicLengthMs } = await composeInstrumentalFromHumming({
    instrument,
    mood,
    durationMs,
    humContext,
    gmPresetSlug,
    customPrompt,
  });

  return {
    id: `render-${Date.now()}`,
    label: 'Your instrumental',
    blob: audioBlob,
    url: URL.createObjectURL(audioBlob),
    prompt,
    humContext,
    durationMs: musicLengthMs,
    provider: 'elevenlabs',
    providerLabel: 'ElevenLabs',
    cleaned: prep.cleaned,
    cleanStats: prep.stats,
  };
}

async function composeLayerFromPrompt(prompt, durationMs) {
  if (!ELEVENLABS_API_KEY && !import.meta.env.DEV) {
    throw new Error('ElevenLabs API key is not configured.');
  }

  const musicLengthMs = Math.min(180_000, Math.max(3_000, Math.round(durationMs)));
  const url = `${ELEVENLABS_API_BASE}/v1/music?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      prompt,
      music_length_ms: musicLengthMs,
      model_id: 'music_v1',
      force_instrumental: true,
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json?.detail?.[0]?.msg ?? json?.message ?? JSON.stringify(json);
    } catch {
      try {
        detail = await res.text();
      } catch {
        // keep statusText
      }
    }
    throw new Error(`ElevenLabs (${res.status}): ${detail}`);
  }

  const raw = await res.blob();
  if (!raw.size) {
    throw new Error('ElevenLabs returned empty layer audio.');
  }
  if (raw.type && raw.type !== 'application/octet-stream') {
    return raw;
  }
  return new Blob([raw], { type: 'audio/mpeg' });
}

export async function composeMoodLayers({
  instrument,
  mood,
  bpm,
  durationMs,
  humContext,
  layerTypes = defaultWowPassLayerTypes(),
}) {
  const layers = [];
  for (const layerType of layerTypes) {
    const prompt = buildElevenLabsLayerPrompt({
      instrument,
      mood,
      layerType,
      bpm: humContext?.bpm ?? bpm,
      humContext,
    });
    const blob = await composeLayerFromPrompt(
      prompt,
      wowPassLayerDurationMs(layerType, durationMs),
    );
    layers.push({
      id: `${Date.now()}-${layerType.replace(/\s+/g, '-')}`,
      label: layerType,
      prompt,
      blob,
      url: URL.createObjectURL(blob),
    });
  }
  return layers;
}
