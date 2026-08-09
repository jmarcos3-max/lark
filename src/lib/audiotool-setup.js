import {
  AUDIOTOOL_CLIENT_ID,
  AUDIOTOOL_SCOPE,
  getAudiotoolRedirectUrl,
} from '@/lib/audiotool-config';
import {
  audiotoolScopeIncludes,
  audiotoolScopeNeedsRefresh,
} from '@/lib/audiotool-scope';

/** Checks Lark config against https://developer.audiotool.com/js-package-documentation/ */
export function getAudiotoolSetupIssues() {
  const issues = [];

  if (!AUDIOTOOL_CLIENT_ID) {
    issues.push({
      level: 'error',
      message:
        'Audiotool client ID is not configured. Set VITE_AUDIOTOOL_CLIENT_ID in .env.local (dev) or GitHub Actions secrets (Pages).',
    });
  }

  if (!AUDIOTOOL_SCOPE.includes('project:write')) {
    issues.push({
      level: 'warn',
      message: `Scope is "${AUDIOTOOL_SCOPE}"; project:write is required for Studio transform.`,
    });
  }

  if (!audiotoolScopeIncludes('sample:write')) {
    issues.push({
      level: 'warn',
      message:
        'Mood layers import needs sample:write in VITE_AUDIOTOOL_SCOPE (e.g. "project:write sample:write").',
    });
  }

  if (audiotoolScopeNeedsRefresh()) {
    issues.push({
      level: 'warn',
      message:
        'Audiotool scopes changed — sign out and sign in again so Mood layers import can upload samples.',
    });
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') {
      issues.push({
        level: 'error',
        message: 'Use http://127.0.0.1:5173/ for Audiotool OAuth (not localhost).',
      });
    }

  }

  return issues;
}

export function formatAuthError(err, redirectUrl = getAudiotoolRedirectUrl()) {
  if (!(err instanceof Error)) return String(err);
  const msg = err.message;
  if (/server_error|internal server error/i.test(msg)) {
    return (
      'Audiotool OAuth server_error — Redirect URI in developer.audiotool.com must match exactly: '
      + redirectUrl
    );
  }
  if (/invalid.*state/i.test(msg)) {
    return `${msg} Reload ${redirectUrl} and click Log in again.`;
  }
  return msg;
}
