/**
 * Audiotool Studio GM preset categories on gakki (Nexus SDK).
 * Lists load from `client.presets.gmInstruments` / `gmDrums` when available,
 * with a full offline fallback synced from the SDK bundle.
 */

import { GM_FALLBACK_BY_CATEGORY } from '@/lib/gm-fallback-catalog';

/** @typedef {{ slug: string, displayName: string, program: number }} GmPresetOption */

/** Studio browser order (GM-backed categories only; Plucks is search-only). */
export const STUDIO_GM_INSTRUMENT_ORDER = [
  'Piano',
  'Bass',
  'Drums',
  'Lead',
  'Pads',
  'Guitar',
  'Strings',
  'Wind',
  'FX',
  'Mallets',
];

/** Lark Step 3 instrument → GM `category` on gakki (Drums uses `gmDrums`). */
export const GM_CATEGORY_BY_INSTRUMENT = {
  Piano: 'Keys',
  Bass: 'Bass',
  Drums: 'Drums',
  Lead: 'Lead',
  Pads: 'Pad',
  Guitar: 'Guitar',
  Strings: 'Strings',
  Wind: 'Wind',
  FX: 'FX',
  Mallets: 'Mallets',
};

const DEFAULT_GM_PRESET_SLUG = {
  Piano: 'acoustic-piano',
  Bass: 'fingered-bass',
  Drums: 'standard-kit',
  Lead: 'saw-lead',
  Pads: 'warm-pad',
  Guitar: 'clean-guitar',
  Strings: 'violin',
  Wind: 'flute',
  FX: 'orchestra-hit',
  Mallets: 'vibraphone',
};

const GM_PRESET_LABEL = {
  Piano: 'Keys sound',
  Bass: 'Bass sound',
  Drums: 'Drum kit',
  Lead: 'Lead sound',
  Pads: 'Pad sound',
  Guitar: 'Guitar sound',
  Strings: 'Strings sound',
  Wind: 'Wind sound',
  FX: 'FX sound',
  Mallets: 'Mallets sound',
};

const GM_DRUM_INSTRUMENTS = new Set(['Drums']);

const GM_PRESET_BY_SLUG = new Map(
  Object.values(GM_FALLBACK_BY_CATEGORY)
    .flat()
    .map((preset) => [preset.slug, preset]),
);

/** Lark targets with a GM preset picker. */
export const GM_PRESET_INSTRUMENTS = new Set(STUDIO_GM_INSTRUMENT_ORDER);

export function instrumentGmCategory(instrument) {
  return GM_CATEGORY_BY_INSTRUMENT[instrument] ?? null;
}

export function isGmDrumPresetInstrument(instrument) {
  return GM_DRUM_INSTRUMENTS.has(instrument);
}

export function isGmPresetInstrument(instrument) {
  return GM_PRESET_INSTRUMENTS.has(instrument);
}

export function gmPresetPickerLabel(instrument) {
  return GM_PRESET_LABEL[instrument] ?? 'Sound';
}

function mapCatalogEntry({ slug, displayName, program }) {
  return { slug, displayName, program };
}

function listFromClientCatalog(client, instrument) {
  if (isGmDrumPresetInstrument(instrument)) {
    const drums = client?.presets?.gmDrums;
    return drums?.length ? drums.map(mapCatalogEntry) : null;
  }

  const category = instrumentGmCategory(instrument);
  const catalog = client?.presets?.gmInstruments;
  if (!catalog?.length || !category || category === 'Drums') return null;

  const filtered = catalog
    .filter((entry) => entry.category === category)
    .map(mapCatalogEntry);

  return filtered.length ? filtered : null;
}

function listFromFallback(instrument) {
  const category = instrumentGmCategory(instrument);
  if (!category) return [];
  return GM_FALLBACK_BY_CATEGORY[category] ?? [];
}

/** Full preset list for an instrument (live SDK catalog when `client` is passed). */
export function listGmPresetsForInstrument(instrument, client = null) {
  return listFromClientCatalog(client, instrument)
    ?? listFromFallback(instrument);
}

/** @deprecated Use `listGmPresetsForInstrument(instrument, client)` */
export function listGmPresetsFromClient(client, instrument) {
  return listGmPresetsForInstrument(instrument, client);
}

export function defaultGmPresetSlug(instrument) {
  return DEFAULT_GM_PRESET_SLUG[instrument] ?? null;
}

export function normalizeGmPresetSlug(instrument, slug) {
  if (!isGmPresetInstrument(instrument)) return null;

  const allowed = new Set(listFromFallback(instrument).map((preset) => preset.slug));
  if (slug && allowed.has(slug)) return slug;

  return defaultGmPresetSlug(instrument);
}

export function gmPresetDisplayName(slug) {
  return GM_PRESET_BY_SLUG.get(slug)?.displayName ?? null;
}

export async function fetchGmPreset(client, instrument, slug) {
  const normalized = normalizeGmPresetSlug(instrument, slug);
  if (!normalized || !client?.presets) return null;

  if (isGmDrumPresetInstrument(instrument)) {
    return client.presets.getDrums?.(normalized) ?? null;
  }

  return client.presets.getInstrument?.(normalized) ?? null;
}
