import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import { Ticks, secondsToTicks } from '@audiotool/nexus/utils';
import basicPitchModelUrl from '@spotify/basic-pitch/model/model.json?url';
import { analyzeRhythmFromBlob } from '@/lib/hum-rhythm';
import { isDrumInstrument } from '@/lib/lark-instruments';
import { isHumCleaningEnabled, resolveHumBlob } from '@/lib/hum-audio-prep';

const BASIC_PITCH_SAMPLE_RATE = 22050;
const MAX_TRANSCRIBE_SEC = 45;

let modelPromise = null;

function loadBasicPitchModel() {
  if (!modelPromise) {
    modelPromise = import('@tensorflow/tfjs').then((tf) =>
      tf.loadGraphModel(basicPitchModelUrl).then((graph) => new BasicPitch(graph)),
    );
  }
  return modelPromise;
}

async function blobToMonoBuffer22050(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const probe = new AudioContext();
  let decoded;
  try {
    decoded = await probe.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await probe.close();
  }

  const length = Math.min(
    decoded.length,
    Math.ceil(MAX_TRANSCRIBE_SEC * decoded.sampleRate),
  );
  const trimCtx = new AudioContext();
  const trimmed = trimCtx.createBuffer(
    decoded.numberOfChannels,
    length,
    decoded.sampleRate,
  );
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    trimmed.copyToChannel(decoded.getChannelData(ch).subarray(0, length), ch);
  }
  await trimCtx.close();

  const offline = new OfflineAudioContext(
    1,
    Math.ceil((length / decoded.sampleRate) * BASIC_PITCH_SAMPLE_RATE),
    BASIC_PITCH_SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = trimmed;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

function quantizeTick(timeSec, bpm) {
  const raw = secondsToTicks(timeSec, bpm);
  const grid = Ticks.SemiQuaver;
  return Math.max(0, Math.round(raw / grid) * grid);
}

function adaptNoteForInstrument(note, instrument, mood, bpm) {
  let pitch = Math.round(note.pitchMidi);
  let velocity = Math.min(1, Math.max(0.25, note.amplitude ?? 0.6));

  if (isDrumInstrument(instrument)) {
    if (pitch < 45) pitch = 36;
    else if (pitch < 55) pitch = 38;
    else pitch = 42;
    velocity = Math.min(1, velocity * 1.1);
  } else if (instrument === 'Bass') {
    pitch = Math.max(28, Math.min(55, pitch - 24));
  } else if (instrument === 'Guitar' && pitch < 40) {
    pitch += 12;
  }

  const durationTicks = Math.max(
    Math.round(Ticks.SemiQuaver * 0.5),
    Math.min(Ticks.Beat * 2, secondsToTicks(note.durationSeconds, bpm)),
  );

  return { pitch, velocity, durationTicks };
}

function notesToPlans(notes, { instrument, mood, bpm, durationSec }) {
  const filtered = notes
    .filter((n) => n.amplitude >= 0.2 && n.durationSeconds >= 0.04)
    .filter((n) => n.startTimeSeconds <= MAX_TRANSCRIBE_SEC)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  const notePlans = filtered.map((note) => {
    const adapted = adaptNoteForInstrument(note, instrument, mood, bpm);
    return {
      positionTicks: quantizeTick(note.startTimeSeconds, bpm),
      pitch: adapted.pitch,
      durationTicks: adapted.durationTicks,
      velocity: adapted.velocity,
    };
  });

  const regionDuration = Math.max(
    Ticks.Bars(1),
    secondsToTicks(Math.max(durationSec, 1), bpm) + Ticks.Beat,
  );

  return { notePlans, regionDuration, noteCount: notePlans.length };
}

/**
 * Transcribe humming to MIDI note plans with Spotify Basic Pitch (free, in-browser).
 * Falls back to rhythm-only on failure.
 */
export async function transcribeHumToNotes(blob, {
  instrument,
  mood,
  onProgress,
  cleanHum = isHumCleaningEnabled(),
} = {}) {
  const prep = await resolveHumBlob(blob, { onProgress, enabled: cleanHum });
  const analysisBlob = prep.blob;

  const rhythm = await analyzeRhythmFromBlob(analysisBlob);
  const bpm = rhythm.bpm ?? 120;
  const durationSec = Math.min(rhythm.durationSec ?? MAX_TRANSCRIBE_SEC, MAX_TRANSCRIBE_SEC);

  try {
    onProgress?.('Loading Basic Pitch model…');
    const basicPitch = await loadBasicPitchModel();

    onProgress?.('Listening to your hum…');
    const audioBuffer = await blobToMonoBuffer22050(analysisBlob);

    const frames = [];
    const onsets = [];
    const contours = [];

    await basicPitch.evaluateModel(
      audioBuffer,
      (f, o, c) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (pct) => {
        if (pct > 0 && pct < 1) {
          onProgress?.(`Transcribing… ${Math.round(pct * 100)}%`);
        }
      },
    );

    const noteEvents = noteFramesToTime(
      addPitchBendsToNoteEvents(
        contours,
        outputToNotesPoly(frames, onsets, 0.3, 0.3, 5),
      ),
    );

    const { notePlans, regionDuration, noteCount } = notesToPlans(noteEvents, {
      instrument,
      mood,
      bpm,
      durationSec,
    });

    if (noteCount < 2) {
      throw new Error('Basic Pitch found too few notes — using rhythm fallback.');
    }

    return {
      source: 'basic-pitch',
      bpm,
      durationSec,
      notePlans,
      regionDuration,
      noteCount,
      cleaned: prep.cleaned,
      cleanStats: prep.stats,
    };
  } catch (err) {
    const rhythmPlans = rhythm.onsets.map((onset, index) => {
      const positionTicks = quantizeTick(onset.timeSec, bpm);
      const velocity = 0.35 + onset.strength * 0.55;
      const durationTicks = Math.round(Ticks.SemiQuaver * 0.85);
      let pitch = 60;
      if (isDrumInstrument(instrument)) pitch = index % 4 === 0 ? 36 : index % 2 ? 38 : 42;
      else if (instrument === 'Bass') pitch = 40;
      else if (instrument === 'Guitar') pitch = 67;
      if (mood === 'Melancholic') pitch -= 3;
      return { positionTicks, durationTicks, pitch, velocity };
    });

    return {
      source: 'rhythm-fallback',
      bpm,
      durationSec,
      notePlans: rhythmPlans,
      regionDuration: Math.max(
        Ticks.Bars(1),
        secondsToTicks(Math.max(durationSec, 1), bpm) + Ticks.Beat,
      ),
      noteCount: rhythmPlans.length,
      fallbackReason: err instanceof Error ? err.message : String(err),
      cleaned: prep.cleaned,
      cleanStats: prep.stats,
    };
  }
}
