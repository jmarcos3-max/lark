import { isElevenLabsConfigured } from '@/lib/elevenlabs-config';
import { isReplicateConfigured } from '@/lib/replicate-config';
import { renderInstrumentalFromHum as renderInstrumentalFromHumElevenLabs } from '@/lib/elevenlabs-api';
import { renderInstrumentalFromHumReplicate } from '@/lib/replicate-api';

/**
 * Render hum → produced instrumental MP3.
 * Prefers Replicate MusicGen (real hum audio conditioning) when configured,
 * then falls back to ElevenLabs prompt-based render.
 */
export async function renderInstrumentalFromHum(options) {
  if (isReplicateConfigured()) {
    try {
      return await renderInstrumentalFromHumReplicate(options);
    } catch (err) {
      if (!isElevenLabsConfigured()) {
        throw err;
      }
      options.onProgress?.('MusicGen unavailable, trying ElevenLabs…');
      const result = await renderInstrumentalFromHumElevenLabs(options);
      return {
        ...result,
        provider: 'elevenlabs',
        providerLabel: 'ElevenLabs',
        fallbackFrom: 'replicate',
        fallbackError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const result = await renderInstrumentalFromHumElevenLabs(options);
  return {
    ...result,
    provider: 'elevenlabs',
    providerLabel: 'ElevenLabs',
  };
}

export { isReplicateConfigured } from '@/lib/replicate-config';
export { isElevenLabsConfigured } from '@/lib/elevenlabs-config';
