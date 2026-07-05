const STUDIO_WINDOW_NAME = 'lark-audiotool-studio';
const SESSION_KEY = 'lark-studio-session-project';

/** @type {Window | null} */
let studioWindowRef = null;

export function projectIdFromStudioUrl(dawUrl) {
  try {
    return new URL(dawUrl).searchParams.get('project') ?? dawUrl;
  } catch {
    return dawUrl;
  }
}

function persistStudioWindow(studioWindow, projectId) {
  studioWindowRef = studioWindow ?? null;
  if (typeof window !== 'undefined' && studioWindow) {
    window.__larkStudioWindow = studioWindow;
  }
  if (projectId) {
    sessionStorage.setItem(SESSION_KEY, projectId);
  }
}

function readPersistedStudioWindow() {
  if (studioWindowRef?.closed) {
    studioWindowRef = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
  if (studioWindowRef) return studioWindowRef;

  if (typeof window !== 'undefined' && window.__larkStudioWindow) {
    if (window.__larkStudioWindow.closed) {
      window.__larkStudioWindow = null;
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    studioWindowRef = window.__larkStudioWindow;
    return studioWindowRef;
  }
  return null;
}

/** Project id the Studio tab was last associated with (same-origin or last navigate). */
export function getStudioSessionProjectId() {
  return sessionStorage.getItem(SESSION_KEY);
}

function studioWindowIsOnProject(studioWindow, projectId) {
  if (!studioWindow || !projectId) return false;
  try {
    const href = studioWindow.location.href;
    if (href === 'about:blank' || href === '' || href === 'about:blank#blocked') {
      return false;
    }
    return href.includes(projectId);
  } catch {
    // Cross-origin — trust last-known project for this named tab.
    return sessionStorage.getItem(SESSION_KEY) === projectId;
  }
}

/**
 * Find the Lark-named Studio tab without opening a new one.
 * Closes accidental about:blank placeholders the browser may create.
 * @returns {Window | null}
 */
function resolveStudioWindow() {
  const cached = readPersistedStudioWindow();
  if (cached) return cached;

  const candidate = window.open('', STUDIO_WINDOW_NAME);
  if (!candidate || candidate.closed) return null;

  try {
    const href = candidate.location.href;
    if (href === 'about:blank' || href === '' || href === 'about:blank#blocked') {
      candidate.close();
      return null;
    }
    persistStudioWindow(candidate, sessionStorage.getItem(SESSION_KEY));
    return candidate;
  } catch {
    // Cross-origin — real Studio tab exists under this window name.
    persistStudioWindow(candidate, sessionStorage.getItem(SESSION_KEY));
    return candidate;
  }
}

/**
 * Focus an existing Studio tab. Never opens or navigates.
 * @returns {Window | null}
 */
export function focusAudiotoolStudioTab() {
  const studioWindow = resolveStudioWindow();
  studioWindow?.focus?.();
  return studioWindow;
}

/**
 * Reuse the Lark Studio tab: navigate only when the project changed.
 * @param {string | null | undefined} dawUrl
 * @param {{ focus?: boolean, openIfMissing?: boolean }} [options]
 * @returns {Window | null}
 */
export function syncStudioTabToProject(dawUrl, {
  focus = false,
  openIfMissing = false,
} = {}) {
  if (!dawUrl || typeof window === 'undefined') return null;

  const projectId = projectIdFromStudioUrl(dawUrl);
  const existing = resolveStudioWindow();

  if (!existing) {
    if (!openIfMissing) return null;
    const opened = window.open(dawUrl, STUDIO_WINDOW_NAME);
    persistStudioWindow(opened, projectId);
    opened?.focus?.();
    return opened ?? null;
  }

  if (!studioWindowIsOnProject(existing, projectId)) {
    existing.location.href = dawUrl;
  }

  persistStudioWindow(existing, projectId);
  if (focus) existing.focus();
  return existing;
}

/**
 * Explicit "Open in Studio" — reuse tab when possible, navigate if project differs.
 * @param {string | null | undefined} dawUrl
 * @returns {Window | null}
 */
export function openAudiotoolStudio(dawUrl) {
  return syncStudioTabToProject(dawUrl, { focus: true, openIfMissing: true });
}

/**
 * After transform: focus an in-sync tab (live Nexus update) or open/navigate.
 * Never reloads when Studio is already on this project.
 * @param {string | null | undefined} dawUrl
 * @returns {Window | null}
 */
export function openStudioAfterTransform(dawUrl) {
  return syncStudioTabToProject(dawUrl, { focus: true, openIfMissing: true });
}

/**
 * When Lark connects to a different project — point the Studio tab at it.
 * @param {string | null | undefined} dawUrl
 */
export function onLarkProjectChanged(dawUrl) {
  syncStudioTabToProject(dawUrl, { focus: false, openIfMissing: false });
}

/** @deprecated Use openStudioAfterTransform */
export function prepareStudioForTransform(dawUrl) {
  const win = openStudioAfterTransform(dawUrl);
  return { action: win ? 'opened' : 'skipped', window: win };
}

/** @deprecated Use prepareStudioForTransform */
export function primeAudiotoolStudioTab(dawUrl) {
  return prepareStudioForTransform(dawUrl).window;
}
