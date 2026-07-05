import { Ticks, secondsToTicks } from '@audiotool/nexus/utils';
import {
  deviceLabel,
  deviceNeedsNoteChainVoice,
  isDrumInstrument,
  layerDeviceLabel,
  NEXUS_DEVICE_BY_INSTRUMENT,
  noteChainVoiceType,
  nexusDeviceCreateOptions,
} from '@/lib/lark-instruments';
import { adaptNotePlansForLayer } from '@/lib/lark-layer-notes';
import {
  findLarkDevices,
  findLarkHumReferenceDevices,
  findLarkMixerChannels,
  findLarkNoteTracks,
} from '@/lib/nexus-instruments';
import {
  ensureMixerChannelInTransaction,
  primeDeviceForPlayback,
  wireDeviceToMixerChannel,
  wireNotesOutputToInput,
} from '@/lib/nexus-mixer-routing';

function fieldValue(field) {
  if (field == null) return undefined;
  return typeof field === 'object' && 'value' in field ? field.value : field;
}

function getProjectBpm(nexusDoc) {
  const configs = nexusDoc.queryEntities?.ofTypes('config')?.get?.() ?? [];
  const cfg = configs[0];
  const bpm = fieldValue(cfg?.fields?.tempoBpm);
  return typeof bpm === 'number' && bpm > 0 ? bpm : 125;
}

function nextTrackOrder(nexusDoc) {
  const types = ['noteTrack', 'audioTrack', 'patternTrack', 'automationTrack'];
  let max = 0;
  for (const type of types) {
    const tracks = nexusDoc.queryEntities?.ofTypes(type)?.get?.() ?? [];
    for (const tr of tracks) {
      const o = fieldValue(tr.fields?.orderAmongTracks);
      if (typeof o === 'number' && o > max) max = o;
    }
  }
  return max + 1;
}

function assertDocumentReady(nexusDoc) {
  if (!nexusDoc?.modify) {
    throw new Error('Audiotool project is not open. Select a connected project and try again.');
  }
  const connected = nexusDoc.connected?.value ?? nexusDoc.connected;
  if (connected === false) {
    throw new Error('Lost connection to Audiotool. Wait a moment and try again.');
  }
}

function applyDeviceLayout(t, device, { label, positionX, positionY }) {
  if (device?.fields?.displayName) {
    try {
      t.update(device.fields.displayName, label);
    } catch {
      // ignore invalid display name updates
    }
  }
  for (const [key, value] of [['positionX', positionX], ['positionY', positionY]]) {
    if (device?.fields?.[key]) {
      try {
        t.update(device.fields[key], value);
      } catch {
        // ignore invalid layout updates
      }
    }
  }
}

function writeInstrumentTrack(t, {
  instrument,
  label,
  notePlans,
  orderAmongTracks,
  slotIndex,
  duration,
  gmPreset = null,
}) {
  const { deviceType, options: deviceOptions } = nexusDeviceCreateOptions(instrument, {
    label,
    positionX: 140 + (slotIndex % 3) * 240,
    positionY: 180 + slotIndex * 120,
  });

  const collection = t.create('noteCollection', {});
  const positionX = deviceOptions.positionX;
  const positionY = deviceOptions.positionY;

  let notePlayer = null;
  let audioDevice = null;
  let notesCabled = true;

  if (deviceNeedsNoteChainVoice(deviceType)) {
    const voiceType = noteChainVoiceType(deviceType);
    const midiDevice = t.create(deviceType, deviceOptions);
    primeDeviceForPlayback(t, midiDevice);

    const voice = t.create(voiceType, {
      displayName: `${label} · Voice`,
      positionX: positionX + 140,
      positionY,
      isActive: true,
      gain: 0.7,
    });
    primeDeviceForPlayback(t, voice);

    notesCabled = wireNotesOutputToInput(t, midiDevice, voice);
    notePlayer = midiDevice;
    audioDevice = voice;
  } else if (gmPreset) {
    const device = t.createDeviceFromPreset(gmPreset);
    applyDeviceLayout(t, device, { label, positionX, positionY });
    primeDeviceForPlayback(t, device);
    notePlayer = device;
    audioDevice = device;
  } else {
    const device = t.create(deviceType, deviceOptions);
    primeDeviceForPlayback(t, device);
    notePlayer = device;
    audioDevice = device;
  }

  const track = t.create('noteTrack', {
    player: notePlayer.location,
    orderAmongTracks,
  });

  t.create('noteRegion', {
    collection: collection.location,
    track: track.location,
    region: {
      positionTicks: 0,
      durationTicks: duration,
      displayName: label,
    },
  });

  const mixerChannel = ensureMixerChannelInTransaction(t, { stripLabel: label, forceNew: true });
  const cabled = notesCabled && wireDeviceToMixerChannel(t, audioDevice, mixerChannel);

  for (const plan of notePlans) {
    t.create('note', {
      collection: collection.location,
      positionTicks: plan.positionTicks,
      durationTicks: plan.durationTicks,
      pitch: plan.pitch,
      velocity: plan.velocity,
    });
  }

  return { noteCount: notePlans.length, cabled, deviceType };
}

/**
 * Write MIDI note plans to a primary instrument plus optional Studio layers.
 */
export async function applyNotesWithLayers(
  nexusDoc,
  {
    instrument,
    layers = [],
    mood,
    notePlans,
    regionDuration,
    bpm: bpmOverride,
    gmPreset = null,
  },
) {
  assertDocumentReady(nexusDoc);

  if (!notePlans?.length) {
    throw new Error('No notes to write. Try humming louder or closer to the mic.');
  }

  const bpm = bpmOverride ?? getProjectBpm(nexusDoc);
  const duration =
    regionDuration
    ?? Math.max(Ticks.Bars(1), secondsToTicks(8, bpm) + Ticks.Beat);

  const larkDevicesToRemove = findLarkDevices(nexusDoc);
  const larkHumReferenceToRemove = findLarkHumReferenceDevices(nexusDoc);
  const larkNoteTracksToRemove = findLarkNoteTracks(nexusDoc);
  const larkMixerChannelsToRemove = findLarkMixerChannels(nexusDoc);
  let trackOrder = nextTrackOrder(nexusDoc);
  let totalNoteCount = 0;
  let allCabled = true;
  const layersWritten = [];

  const targets = [
    {
      instrument,
      label: deviceLabel(instrument, mood),
      plans: notePlans,
    },
    ...layers.map((layer) => ({
      instrument: layer,
      label: layerDeviceLabel(layer, mood),
      plans: adaptNotePlansForLayer(notePlans, layer, instrument),
    })),
  ];

  await nexusDoc.modify((t) => {
    for (const entity of larkDevicesToRemove) {
      try {
        t.removeWithDependencies(entity);
      } catch {
        // ignore stale entity
      }
    }
    for (const entity of larkHumReferenceToRemove) {
      try {
        t.removeWithDependencies(entity);
      } catch {
        // ignore stale entity
      }
    }
    for (const entity of larkNoteTracksToRemove) {
      try {
        t.removeWithDependencies(entity);
      } catch {
        // ignore stale entity
      }
    }
    for (const entity of larkMixerChannelsToRemove) {
      try {
        t.removeWithDependencies(entity);
      } catch {
        // ignore stale entity
      }
    }

    targets.forEach((target, index) => {
      const result = writeInstrumentTrack(t, {
        instrument: target.instrument,
        label: target.label,
        notePlans: target.plans,
        orderAmongTracks: trackOrder,
        slotIndex: index,
        duration,
        gmPreset: index === 0 ? gmPreset : null,
      });
      trackOrder += 1;
      totalNoteCount += result.noteCount;
      allCabled = allCabled && result.cabled;
      if (index > 0) layersWritten.push(target.instrument);
    });
  });

  if (!allCabled) {
    throw new Error(
      'Notes were added but one or more instruments are not wired to Master. Cable outputs to free sockets on the Master stagebox.',
    );
  }

  return {
    noteCount: totalNoteCount,
    leadNoteCount: notePlans.length,
    layerCount: layersWritten.length,
    layersWritten,
    bpm,
    cabled: allCabled,
    deviceType: NEXUS_DEVICE_BY_INSTRUMENT[instrument] ?? 'gakki',
  };
}

/** @deprecated Use applyNotesWithLayers */
export async function applyNotesToInstrument(nexusDoc, options) {
  const { instrument, mood, notePlans, regionDuration, bpm } = options;
  return applyNotesWithLayers(nexusDoc, {
    instrument,
    layers: [],
    mood,
    notePlans,
    regionDuration,
    bpm,
  });
}

/** @deprecated Use applyNotesWithLayers after transcribeHumToNotes */
export async function applyRhythmToInstrument(nexusDoc, { instrument, mood, rhythm }) {
  const bpm = rhythm.bpm ?? getProjectBpm(nexusDoc);
  const notePlans = rhythm.onsets.map((onset, index) => {
    const positionTicks = Math.max(
      0,
      Math.round(secondsToTicks(onset.timeSec, bpm) / Ticks.SemiQuaver) * Ticks.SemiQuaver,
    );
    let pitch = 60;
    if (isDrumInstrument(instrument)) pitch = index % 4 === 0 ? 36 : index % 2 ? 38 : 42;
    return {
      positionTicks,
      durationTicks: Math.round(Ticks.SemiQuaver * 0.85),
      pitch,
      velocity: 0.35 + onset.strength * 0.55,
    };
  });
  return applyNotesWithLayers(nexusDoc, {
    instrument,
    layers: [],
    mood,
    notePlans,
    bpm,
    regionDuration: Math.max(
      Ticks.Bars(1),
      secondsToTicks(Math.max(rhythm.durationSec, 1), bpm) + Ticks.Beat,
    ),
  });
}
