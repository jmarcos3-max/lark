import { defaultWowPassLayerTypes, sanitizeWowPassLayers } from '@/lib/lark-instruments';

const LARK_META_PREFIX = 'lark-meta:';

/** Encode Lark session fields into an Audiotool project description. */
export function encodeLarkMetadata({
  source_audio_url,
  target_instrument,
  gm_preset_slug,
  selected_mood,
  production_brief,
  elevenlabs_output_url,
  studio_layers,
  wow_pass_layers,
}) {
  return LARK_META_PREFIX
    + JSON.stringify({
      source_audio_url: source_audio_url ?? null,
      target_instrument: target_instrument ?? null,
      gm_preset_slug: gm_preset_slug ?? null,
      selected_mood: selected_mood ?? null,
      production_brief: production_brief ?? null,
      elevenlabs_output_url: elevenlabs_output_url ?? null,
      studio_layers: studio_layers ?? [],
      wow_pass_layers: wow_pass_layers ?? defaultWowPassLayerTypes(),
    });
}

export function decodeLarkMetadata(description) {
  if (!description?.startsWith(LARK_META_PREFIX)) return null;
  try {
    return JSON.parse(description.slice(LARK_META_PREFIX.length));
  } catch {
    return null;
  }
}

export function projectIdFromName(name) {
  if (!name) return '';
  const match = String(name).match(/projects\/(.+)$/);
  return match ? match[1] : name;
}

/** Audiotool API resource name: `projects/{uuid}` */
export function normalizeProjectResourceName(name) {
  if (!name) return '';
  const raw = String(name).trim();
  if (raw.startsWith('projects/')) return raw;
  const id = projectIdFromName(raw);
  return id ? `projects/${id}` : raw;
}

export function studioUrlForProject(name) {
  const id = projectIdFromName(name);
  return id ? `https://beta.audiotool.com/studio?project=${id}` : '';
}

export function audiotoolProjectToLark(project) {
  const meta = decodeLarkMetadata(project?.description);
  return {
    audiotoolName: project?.name ?? null,
    title: project?.displayName || 'Untitled Track',
    dawUrl: studioUrlForProject(project?.name),
    source_audio_url: meta?.source_audio_url ?? null,
    target_instrument: meta?.target_instrument ?? null,
    gm_preset_slug: meta?.gm_preset_slug ?? null,
    selected_mood: meta?.selected_mood ?? null,
    production_brief: meta?.production_brief ?? null,
    elevenlabs_output_url: meta?.elevenlabs_output_url ?? null,
    studio_layers: meta?.studio_layers ?? [],
    wow_pass_layers: sanitizeWowPassLayers(
      meta?.wow_pass_layers ?? defaultWowPassLayerTypes(),
    ),
    createTime: project?.createTime,
    updateTime: project?.updateTime,
  };
}

export const emptyLarkProject = () => ({
  audiotoolName: null,
  title: 'Untitled Track',
  dawUrl: null,
  source_audio_url: null,
  target_instrument: null,
  gm_preset_slug: null,
  selected_mood: null,
  production_brief: null,
  elevenlabs_output_url: null,
  studio_layers: [],
  wow_pass_layers: defaultWowPassLayerTypes(),
  createTime: null,
  updateTime: null,
});
