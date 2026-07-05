import { analyzeRhythmFromBlob } from '@/lib/hum-rhythm';
import { humToneContextFromTranscription } from '@/lib/hum-tone-context';
import { availableStudioLayers, sanitizeStudioLayers } from '@/lib/lark-instruments';
import { isHumCleaningEnabled, resolveHumBlob } from '@/lib/hum-audio-prep';

const MOOD_STYLE = {
  Calm: 'soft, gentle dynamics, spacious mix',
  Rock: 'driving energy, punchy rhythm, bold tone',
  Melancholic: 'minor tonality, emotional, subdued brightness',
  Energetic: 'bright, upbeat, lively rhythm and forward motion',
};

const REGISTER_LABEL = {
  low: 'low register',
  mid: 'mid register',
  high: 'high register',
};

function registerFromPitchCenter(center) {
  if (center < 52) return 'low';
  if (center > 67) return 'high';
  return 'mid';
}

function densityLabel(noteCount, durationSec) {
  const notesPerSec = noteCount / Math.max(durationSec, 1);
  if (notesPerSec < 1.2) return 'sparse';
  if (notesPerSec < 2.5) return 'moderate';
  return 'busy';
}

/**
 * Heuristic Studio suggestions from hum analysis (no LLM).
 * @returns {{ instrument: string, mood: string, studioLayers: string[], chips: string[] }}
 */
export function inferStudioSuggestions({
  transcription,
  humContext,
  rhythm,
}) {
  const bpm = transcription?.bpm ?? rhythm?.bpm ?? 120;
  const noteCount = transcription?.noteCount ?? humContext?.noteCount ?? 0;
  const pitchCenter = humContext?.pitchCenter ?? 60;
  const pitchMin = humContext?.pitchMin ?? pitchCenter - 6;
  const pitchMax = humContext?.pitchMax ?? pitchCenter + 6;
  const pitchRange = pitchMax - pitchMin;
  const durationSec = transcription?.durationSec ?? rhythm?.durationSec ?? 8;
  const onsetCount = rhythm?.onsets?.length ?? 0;

  let mood = 'Calm';
  if (bpm >= 128) mood = 'Energetic';
  else if (bpm >= 108) mood = 'Rock';
  else if (pitchCenter < 55 && densityLabel(noteCount, durationSec) === 'sparse') {
    mood = 'Melancholic';
  }

  let instrument = 'Piano';
  if (pitchCenter < 50 || (pitchRange < 10 && pitchCenter < 55)) {
    instrument = 'Bass';
  } else if (onsetCount > 18 && pitchRange < 8 && noteCount < 12) {
    instrument = 'Drums';
  } else if (noteCount > 18 && bpm >= 105) {
    instrument = 'Lead';
  } else if (pitchRange < 10 && noteCount < 8) {
    instrument = 'Pads';
  } else if (pitchCenter > 66) {
    instrument = 'Guitar';
  } else if (mood === 'Energetic' && pitchCenter > 58) {
    instrument = 'Lead';
  }

  const layers = [];
  if (instrument !== 'Pads') layers.push('Pad');
  if (instrument !== 'Bass' && mood !== 'Calm') layers.push('Bass');
  if ((mood === 'Energetic' || mood === 'Rock') && instrument !== 'Lead') {
    layers.push('Arp');
  }

  const studioLayers = sanitizeStudioLayers(layers, instrument);

  const chips = [
    `${Math.round(bpm)} BPM`,
    `${noteCount} notes`,
    REGISTER_LABEL[registerFromPitchCenter(pitchCenter)],
    densityLabel(noteCount, durationSec),
  ];

  return { instrument, mood, studioLayers, bpm, noteCount, pitchCenter, chips };
}

/**
 * Human-readable production brief from analysis + suggestions.
 */
export function buildProductionBriefText({
  suggestions,
  humContext,
  transcription,
  instrument = suggestions?.instrument,
  mood = suggestions?.mood,
  studioLayers = suggestions?.studioLayers ?? [],
}) {
  const bpm = Math.round(transcription?.bpm ?? suggestions?.bpm ?? 120);
  const noteCount = transcription?.noteCount ?? suggestions?.noteCount ?? 0;
  const style = MOOD_STYLE[mood] ?? 'balanced studio mix';
  const register = humContext?.pitchCenter
    ? REGISTER_LABEL[registerFromPitchCenter(humContext.pitchCenter)]
    : 'mid register';
  const density = densityLabel(noteCount, transcription?.durationSec ?? 8);
  const layerLine = studioLayers.length
    ? `Studio layers: ${studioLayers.join(', ')}.`
    : 'Single lead track in Studio.';

  const melodyLine = humContext?.melodicHint
    ? `Melodic contour: ${humContext.melodicHint}.`
    : `About ${noteCount} sung notes at ~${bpm} BPM.`;

  return [
    `${mood} ${instrument.toLowerCase()} sketch, ${bpm} BPM, ${density} phrasing in the ${register}.`,
    melodyLine,
    `Suggested lead: ${instrument} (${style}). ${layerLine}`,
    'Transform writes editable MIDI in Audiotool Studio.',
  ].join(' ');
}

/**
 * Analyze humming and return suggestions + default brief text.
 */
export async function analyzeHumForBrief(blob, { onProgress } = {}) {
  const prep = await resolveHumBlob(blob, {
    onProgress,
    enabled: isHumCleaningEnabled(),
  });
  const analysisBlob = prep.blob;

  onProgress?.('Listening to rhythm…');
  const rhythm = await analyzeRhythmFromBlob(analysisBlob);

  onProgress?.('Transcribing melody…');
  const { transcribeHumToNotes } = await import('@/lib/hum-basic-pitch');
  const transcription = await transcribeHumToNotes(analysisBlob, {
    instrument: 'Piano',
    mood: null,
    onProgress,
    cleanHum: false,
  });

  const humContext = humToneContextFromTranscription(transcription);
  const suggestions = inferStudioSuggestions({ transcription, humContext, rhythm });
  const text = buildProductionBriefText({ suggestions, humContext, transcription });

  return {
    text,
    suggestions,
    humContext,
    transcription,
    rhythm,
    cleaned: prep.cleaned,
  };
}

/** Rebuild brief when Studio picks change but analysis is cached. */
export function refreshBriefFromSelections(analysis, {
  instrument,
  mood,
  studioLayers,
}) {
  if (!analysis) return '';
  const layers = sanitizeStudioLayers(
    studioLayers ?? analysis.suggestions?.studioLayers ?? [],
    instrument ?? analysis.suggestions?.instrument,
  );
  return buildProductionBriefText({
    suggestions: analysis.suggestions,
    humContext: analysis.humContext,
    transcription: analysis.transcription,
    instrument: instrument ?? analysis.suggestions?.instrument,
    mood: mood ?? analysis.suggestions?.mood,
    studioLayers: layers,
  });
}

/** Prompt for MusicGen / ElevenLabs — uses user brief when provided. */
export function briefToRenderPrompt(briefText, { instrument, mood } = {}) {
  const trimmed = briefText?.trim();
  if (trimmed) {
    return `${trimmed} Instrumental only, no vocals, professional mix.`;
  }
  const style = MOOD_STYLE[mood] ?? 'balanced studio mix';
  return `High-quality ${instrument?.toLowerCase() ?? 'instrumental'}, ${style}, no vocals`;
}

export function suggestionChips(analysis) {
  return analysis?.suggestions?.chips ?? [];
}

export function layersAvailableForSuggestion(instrument) {
  return availableStudioLayers(instrument).map((l) => l.value);
}
