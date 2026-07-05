export const REPLICATE_API_TOKEN = import.meta.env.VITE_REPLICATE_API_TOKEN ?? '';

/** Dev proxy keeps the token in .env.local (server) only. */
export const REPLICATE_API_BASE =
  import.meta.env.VITE_REPLICATE_API_BASE
  ?? (import.meta.env.DEV ? '/api/replicate' : 'https://api.replicate.com/v1');

export function isReplicateConfigured() {
  if (REPLICATE_API_TOKEN) return true;
  return import.meta.env.DEV;
}
