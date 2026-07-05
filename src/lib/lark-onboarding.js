const STORAGE_KEY = 'lark-onboarding-v1';

export const ONBOARDING_REPLAY_EVENT = 'lark-onboarding-replay';

export const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Lark',
    body: 'Turn a hummed melody into editable music in Audiotool Studio — real MIDI on real instruments, not a locked MP3.',
  },
  {
    id: 'capture',
    target: 'capture',
    title: 'Step 1 · Record your hum',
    body: 'Hum or import audio in the left column. Lark listens to pitch and rhythm — no DAW setup required.',
  },
  {
    id: 'brief',
    target: 'brief',
    title: 'Production brief',
    body: 'Lark drafts a plan from your hum: tempo, mood, and instrument ideas. Edit the brief, then Apply to Studio.',
  },
  {
    id: 'studio',
    target: 'studio',
    title: 'Audiotool Studio · Steps 2–5',
    body: 'Connect a project, choose your lead instrument, mood, and optional layers. Use the production brief’s Apply button to fill these in quickly.',
  },
  {
    id: 'transform',
    target: 'transform',
    title: 'Step 6 · Transform to Studio',
    body: 'When you’re ready, Transform transcribes your hum and writes editable MIDI. Studio opens when sync finishes — press play from bar 1.',
  },
];

export function isOnboardingComplete() {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) === 'done';
}

export function completeOnboarding() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, 'done');
}

export function resetOnboarding() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function requestOnboardingReplay() {
  resetOnboarding();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
  }
}
