import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useAudiotool } from '@/lib/AudiotoolContext';
import AppearanceMenu from '@/components/lark/AppearanceMenu';
import { STUDIO_NAV_TAGLINE } from '@/lib/lark-copy';
import { requestOnboardingReplay } from '@/lib/lark-onboarding';
import { Compass, LogOut, User, RefreshCw, Loader2 } from 'lucide-react';

const LarkMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 13 Q5 4 9 5 Q13 6 10 10 Q8 13 11 14 Q14 15 16 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="9" cy="4" r="1.2" fill="white" opacity="0.7"/>
  </svg>
);

export { default as ThemeToggle } from '@/components/lark/AppearanceMenu';

function AudiotoolLoginButton() {
  const { login, isLoading, error, setupIssues } = useAudiotool();
  const displayError =
    error?.message ?? setupIssues.find((i) => i.level === 'error')?.message;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => login()}
        title={displayError ?? 'Log in with Audiotool'}
        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer"
        style={{
          color: 'var(--lark-text-muted)',
          border: '1px solid var(--lark-border)',
          background: 'rgba(128,128,128,0.05)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--lark-violet-bright)';
          e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--lark-text-muted)';
          e.currentTarget.style.borderColor = 'var(--lark-border)';
        }}
      >
        {isLoading ? (
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--lark-violet-bright)' }} />
        ) : (
          <User size={12} />
        )}
        <span>{isLoading ? 'Connecting…' : 'Log in'}</span>
      </button>
      {displayError && (
        <p className="text-[10px] max-w-[260px] text-right leading-snug" style={{ color: '#f87171' }}>
          {displayError}
        </p>
      )}
    </div>
  );
}

export default function LarkNavbar({ isConnected }) {
  const { user, logout: logoutBase44 } = useAuth();
  const { userName, isAuthenticated, logout: logoutAudiotool } = useAudiotool();
  const nexusConnected = isConnected ?? isAuthenticated;
  const displayName = userName || user?.full_name || user?.email;
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSignOut = () => {
    if (isAuthenticated) {
      logoutAudiotool();
    } else if (user) {
      logoutBase44();
    }
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1200);
  };

  return (
    <header
      className="sticky top-0 z-50 px-6 py-3 flex items-center justify-between"
      style={{
        background: 'var(--lark-header-bg)',
        borderBottom: '1px solid var(--lark-header-border)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}
    >
      {/* Logo — Lark branding */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #7C3AED, #4C1D95)',
            boxShadow: '0 0 16px rgba(139,92,246,0.4)',
          }}
        >
          <LarkMark />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--lark-text)' }}>
            Lark
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-widest"
            style={{
              background: 'rgba(139,92,246,0.15)',
              color: 'var(--lark-violet-bright)',
              border: '1px solid rgba(139,92,246,0.25)',
            }}
          >
            Studio
          </span>
        </div>
      </div>

      {/* Center tagline */}
      <div className="hidden md:flex items-center" style={{ color: 'var(--lark-text-muted)' }}>
        <span className="text-xs font-medium tracking-wide">
          {STUDIO_NAV_TAGLINE}
        </span>
      </div>

      {/* Right area */}
      <div className="flex items-center gap-2">
        {(isAuthenticated || user) && (
          <button
            type="button"
            onClick={() => requestOnboardingReplay()}
            title="Open the Lark guide"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all duration-200"
            style={{
              color: 'var(--lark-text-muted)',
              border: '1px solid var(--lark-border)',
              background: 'rgba(139,92,246,0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--lark-violet-bright)';
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--lark-text-muted)';
              e.currentTarget.style.borderColor = 'var(--lark-border)';
            }}
          >
            <Compass size={13} />
            <span className="hidden sm:inline font-medium">Guide</span>
          </button>
        )}

        {/* Appearance & accessibility */}
        <AppearanceMenu />

        {isAuthenticated || user ? (
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(128,128,128,0.06)', border: '1px solid var(--lark-border)' }}>
              <div
                className={`w-1.5 h-1.5 rounded-full ${nexusConnected ? 'bg-green-400' : 'bg-gray-500'}`}
                style={nexusConnected ? { boxShadow: '0 0 6px #4ade80' } : {}}
              />
              <span className="text-[10px] font-medium" style={{ color: nexusConnected ? '#4ade80' : 'var(--lark-text-muted)' }}>
                {nexusConnected ? 'Connected via Nexus' : 'Offline Sandbox Mode'}
              </span>
            </div>

            {/* Sync button */}
            <button
              onClick={handleSync}
              title="Sync to cloud"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
              style={{ background: 'rgba(128,128,128,0.06)', border: '1px solid var(--lark-border)', color: 'var(--lark-text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--lark-violet-bright)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--lark-text-muted)'; e.currentTarget.style.borderColor = 'var(--lark-border)'; }}
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
            </button>

            {/* User avatar + name */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: 'rgba(139,92,246,0.2)', color: 'var(--lark-violet-bright)', border: '1px solid rgba(139,92,246,0.3)' }}
                >
                  {displayName?.[0]?.toUpperCase() || <User size={12} />}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: nexusConnected ? '#4ade80' : '#6b7280', borderColor: 'var(--lark-bg)' }} />
              </div>
              <span className="text-sm hidden lg:block" style={{ color: 'var(--lark-text-muted)' }}>
                {displayName}
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all duration-200"
              style={{ color: 'var(--lark-text-muted)', border: '1px solid var(--lark-border)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--lark-violet-bright)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--lark-text-muted)'; e.currentTarget.style.borderColor = 'var(--lark-border)'; }}
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        ) : (
          <AudiotoolLoginButton />
        )}
      </div>
    </header>
  );
}