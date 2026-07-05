import {
  deviceLabel,
  NEXUS_DEVICE_BY_INSTRUMENT,
  nexusDeviceCreateOptions,
} from '@/lib/lark-instruments';
import { HUM_REFERENCE_STUDIO_NAME } from '@/lib/lark-copy';
import {
  ensureMixerChannelInTransaction,
  primeDeviceForPlayback,
  resolveMixerChannelInput,
  wireDeviceToMixerChannel,
} from '@/lib/nexus-mixer-routing';

export const LARK_DEVICE_PREFIX = 'Lark · ';

const NEXUS_DEVICE_TYPES = Object.values(NEXUS_DEVICE_BY_INSTRUMENT);

function displayNameOf(entity) {
  const field = entity?.fields?.displayName;
  return field?.value ?? field ?? '';
}

function fieldValue(field) {
  if (field == null) return undefined;
  return typeof field === 'object' && 'value' in field ? field.value : field;
}

function locationsEqual(a, b) {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (typeof a.equals === 'function') return a.equals(b);
  return String(a) === String(b);
}

/** Lark-tagged desktop devices to remove before a new transform. */
export function findLarkDevices(nexusDoc) {
  const results = [];
  for (const deviceType of NEXUS_DEVICE_TYPES) {
    const devices = nexusDoc.queryEntities?.ofTypes(deviceType)?.get?.() ?? [];
    for (const device of devices) {
      const name = displayNameOf(device);
      if (typeof name === 'string' && name.startsWith(LARK_DEVICE_PREFIX)) {
        results.push(device);
      }
    }
  }
  return results;
}

/** Prior hum-reference audio devices (raw recording on timeline — not played). */
export function findLarkHumReferenceDevices(nexusDoc) {
  const devices = nexusDoc.queryEntities?.ofTypes('audioDevice')?.get?.() ?? [];
  return devices.filter((device) => {
    const name = displayNameOf(device);
    return typeof name === 'string'
      && (name === HUM_REFERENCE_STUDIO_NAME || name.startsWith('Lark · Hum'));
  });
}

/** Lark-tagged mixer strips from prior transforms. */
export function findLarkMixerChannels(nexusDoc) {
  const channels = nexusDoc.queryEntities?.ofTypes('mixerChannel')?.get?.() ?? [];
  return channels.filter((channel) => {
    const stripName = fieldValue(channel.fields?.displayParameters?.displayName);
    return typeof stripName === 'string' && stripName.startsWith(LARK_DEVICE_PREFIX);
  });
}

/** Note tracks still pointing at Lark devices (fallback if device removal missed). */
export function findLarkNoteTracks(nexusDoc) {
  const larkDevices = findLarkDevices(nexusDoc);
  if (!larkDevices.length) return [];

  const devicePlayers = larkDevices.map((device) => device.location);
  const tracks = nexusDoc.queryEntities?.ofTypes('noteTrack')?.get?.() ?? [];
  return tracks.filter((track) => {
    const player = fieldValue(track.fields?.player);
    return devicePlayers.some((loc) => locationsEqual(player, loc));
  });
}

/** @deprecated Use resolveMixerChannelInput from nexus-mixer-routing */
export function findMixerChannelForDevice(nexusDoc) {
  return resolveMixerChannelInput(nexusDoc);
}

/**
 * Add an Audiotool device for the chosen instrument, cable it to the mixer, and replace prior Lark devices.
 * @param {import('@audiotool/nexus').SyncedDocument} nexusDoc
 */
export async function addInstrumentDevice(nexusDoc, instrument, mood) {
  if (!nexusDoc?.modify) {
    throw new Error('Audiotool project is not open. Sign in and open or create a project.');
  }

  const label = deviceLabel(instrument, mood);
  const { deviceType, options: deviceOptions } = nexusDeviceCreateOptions(instrument, {
    label,
    positionX: 140,
    positionY: 200,
  });
  const existing = nexusDoc.queryEntities?.ofTypes(deviceType)?.get?.() ?? [];
  const offset = (existing.length % 4) * 220;
  const larkDevicesToRemove = findLarkDevices(nexusDoc);
  let cabled = false;
  let hasMixerChannel = false;

  await nexusDoc.modify((t) => {
    for (const entity of larkDevicesToRemove) {
      try {
        t.removeWithDependencies(entity);
      } catch {
        // ignore
      }
    }

    const device = t.create(deviceType, {
      ...deviceOptions,
      positionX: deviceOptions.positionX + offset,
    });

    primeDeviceForPlayback(t, device);

    const mixerChannel = ensureMixerChannelInTransaction(t);
    hasMixerChannel = Boolean(mixerChannel);
    cabled = wireDeviceToMixerChannel(t, device, mixerChannel);
  });

  return { deviceType, cabled, hasMixerChannel };
}
