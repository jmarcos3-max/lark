function isDocumentConnected(doc) {
  const connected = doc?.connected?.value ?? doc?.connected;
  return connected !== false;
}

/**
 * Brief pause after Nexus writes so Audiotool Studio can receive the full batch
 * before the user switches tabs (avoids "still putting pieces together").
 */
export async function waitForNexusSync(doc, {
  minMs = 900,
  onProgress,
} = {}) {
  if (!doc) {
    await new Promise((resolve) => setTimeout(resolve, minMs));
    return;
  }

  onProgress?.('Syncing to Studio…');

  const started = Date.now();
  while (!isDocumentConnected(doc) && Date.now() - started < 4000) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const elapsed = Date.now() - started;
  const remaining = Math.max(0, minMs - elapsed);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
