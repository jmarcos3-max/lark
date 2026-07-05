import React from 'react';
import { STUDIO_NAV_TAGLINE } from '@/lib/lark-copy';
import { ChevronDown, Loader2, Mic, Music, Piano } from 'lucide-react';
import { ThemeToggle } from '@/components/lark/LarkNavbar';
import { useTheme } from '@/lib/ThemeContext';

const LarkMark = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 13 Q5 4 9 5 Q13 6 10 10 Q8 13 11 14 Q14 15 16 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="9" cy="4" r="1.2" fill="white" opacity="0.7"/>
  </svg>
);

const FLOW = [
  { icon: Mic, label: 'Record' },
  { icon: Music, label: 'Convert' },
  { icon: Piano, label: 'Studio' },
];

const FLOATING_NOTES = [
  { char: '♪', left: '8%', top: '18%', delay: '0s', size: 'text-2xl' },
  { char: '♫', left: '82%', top: '12%', delay: '1.2s', size: 'text-xl' },
  { char: '♩', left: '72%', top: '68%', delay: '0.6s', size: 'text-lg' },
  { char: '♬', left: '14%', top: '72%', delay: '2s', size: 'text-xl' },
  { char: '♪', left: '48%', top: '8%', delay: '1.8s', size: 'text-lg' },
  { char: '♫', left: '90%', top: '48%', delay: '0.3s', size: 'text-2xl' },
];

function AmbientBackground() {
  const bars = [0.35, 0.55, 0.85, 1, 0.75, 0.5, 0.9, 0.6, 0.4, 0.7, 0.95, 0.55, 0.45, 0.8, 0.65, 0.5, 0.75, 0.4, 0.6, 0.85];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="lark-login-glow lark-login-ambient-glow-a absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full blur-3xl" />
      <div
        className="lark-login-glow lark-login-ambient-glow-b absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full blur-3xl"
        style={{ animationDelay: '2s' }}
      />

      {FLOATING_NOTES.map(({ char, left, top, delay, size }) => (
        <span
          key={`${char}-${left}-${top}`}
          className={`lark-login-note absolute ${size} select-none`}
          style={{ left, top, color: 'var(--lark-violet-bright)', animationDelay: delay }}
        >
          {char}
        </span>
      ))}

      <svg className="lark-login-ambient-wave absolute bottom-0 left-0 right-0 h-40" preserveAspectRatio="none" viewBox="0 0 1200 120">
        <path d="M0,60 Q150,20 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z" fill="url(#larkWaveGrad)" />
        <defs>
          <linearGradient id="larkWaveGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--lark-violet)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--lark-violet-bright)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--lark-violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="lark-login-ambient-wave absolute bottom-16 left-1/2 -translate-x-1/2 flex items-end gap-1 h-16">
        {bars.map((scale, i) => (
          <div
            key={i}
            className="wave-bar w-1 rounded-full origin-bottom"
            style={{
              height: '100%',
              background: 'var(--lark-violet-bright)',
              '--dur': `${0.45 + (i % 5) * 0.12}s`,
              animationDelay: `${i * 0.05}s`,
              transform: `scaleY(${scale})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TransformDemo() {
  const waveBars = [0.3, 0.55, 0.9, 1, 0.75, 0.45, 0.85, 0.6, 0.95, 0.5, 0.7, 0.4];
  const midiNotes = ['♪', '♫', '♪', '♩', '♫'];
  const pianoKeys = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  return (
    <div className="lark-login-preview relative hidden lg:flex flex-col rounded-2xl min-h-[420px] overflow-hidden">
      <p
        className="absolute top-6 left-8 text-[10px] uppercase tracking-[0.2em] font-semibold z-10 transition-colors duration-300"
        style={{ color: 'var(--lark-violet-bright)' }}
      >
        Live preview
      </p>

      <div className="relative flex-1 flex items-center justify-center p-8 pt-14">
        <div className="lark-demo-hum absolute inset-0 flex flex-col items-center justify-center gap-5 px-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300"
            style={{
              background: 'var(--lark-violet-dim)',
              color: 'var(--lark-violet-bright)',
              boxShadow: '0 0 32px var(--lark-violet-glow)',
            }}
          >
            <Mic size={28} />
          </div>
          <div className="flex items-end gap-1 h-12 w-full max-w-[220px]">
            {waveBars.map((scale, i) => (
              <div
                key={i}
                className="wave-bar flex-1 rounded-full origin-bottom"
                style={{
                  height: '100%',
                  background: 'linear-gradient(to top, var(--lark-violet), var(--lark-violet-bright))',
                  '--dur': `${0.3 + (i % 4) * 0.08}s`,
                  animationDelay: `${i * 0.04}s`,
                  transform: `scaleY(${scale})`,
                }}
              />
            ))}
          </div>
          <p className="text-xs font-medium transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
            Humming…
          </p>
        </div>

        <div className="lark-demo-midi absolute inset-0 flex flex-col items-center justify-center gap-5 px-10">
          <div className="relative w-full max-w-[260px]">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 space-y-3 opacity-20">
              {[0, 1, 2].map((line) => (
                <div key={line} className="h-px w-full transition-colors duration-300" style={{ background: 'var(--lark-violet-bright)' }} />
              ))}
            </div>
            <div className="relative flex items-center justify-center gap-4 py-6">
              {midiNotes.map((note, i) => (
                <span
                  key={i}
                  className="lark-demo-note text-2xl select-none transition-colors duration-300"
                  style={{ color: 'var(--lark-violet-bright)' }}
                >
                  {note}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
            <Music size={14} style={{ color: 'var(--lark-violet-bright)' }} />
            Basic Pitch → MIDI
          </div>
        </div>

        <div className="lark-demo-studio absolute inset-0 flex flex-col items-center justify-center gap-5 px-10">
          <div
            className="w-full max-w-[260px] rounded-xl p-4 transition-colors duration-300"
            style={{
              background: 'var(--lark-login-demo-surface)',
              border: '1px solid var(--lark-border)',
              boxShadow: '0 4px 20px var(--lark-violet-glow)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Piano size={14} style={{ color: 'var(--lark-violet-bright)' }} />
              <span className="text-[11px] font-medium truncate transition-colors duration-300" style={{ color: 'var(--lark-text)' }}>
                Lark · Piano · Studio
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-4 transition-colors duration-300" style={{ background: 'var(--lark-login-demo-track)' }}>
              <div
                className="lark-demo-scan h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--lark-violet), var(--lark-violet-bright))' }}
              />
            </div>
            <div className="flex gap-0.5 h-10">
              {pianoKeys.map((isBlack, i) => (
                <div
                  key={i}
                  className={`lark-demo-key flex-1 rounded-sm transition-colors duration-300 ${isBlack ? 'opacity-80' : ''}`}
                  style={{
                    background: isBlack ? 'var(--lark-login-key-black)' : 'var(--lark-login-key-white)',
                    border: '1px solid var(--lark-login-preview-border)',
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <p className="text-xs font-medium transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
            Open in Audiotool Studio
          </p>
        </div>

        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 opacity-30">
          <ChevronDown size={14} className="lark-login-arrow transition-colors duration-300" style={{ color: 'var(--lark-violet-bright)' }} />
          <ChevronDown size={14} className="lark-login-arrow transition-colors duration-300" style={{ color: 'var(--lark-violet-bright)', animationDelay: '0.4s' }} />
        </div>
      </div>

      <p className="pb-6 text-center text-[11px] transition-colors duration-300" style={{ color: 'var(--lark-text-subtle)' }}>
        Hum → MIDI → Studio
      </p>
    </div>
  );
}

function MobileFlowStrip() {
  return (
    <div className="flex lg:hidden items-center justify-center gap-2 py-4 mb-2 flex-wrap">
      {FLOW.map(({ icon: Icon, label }, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
            <Icon size={13} style={{ color: 'var(--lark-violet-bright)' }} />
            {label}
          </div>
          {i < FLOW.length - 1 && (
            <span className="transition-colors duration-300" style={{ color: 'var(--lark-text-subtle)' }}>→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function LarkLoginView({
  loading = false,
  onLogin,
  error,
  setupIssues = [],
  isMisconfigured = false,
}) {
  const { resolvedTheme } = useTheme();
  const blockingIssue = setupIssues.find((i) => i.level === 'error');
  const infoIssue = setupIssues.find((i) => i.level === 'info');
  const displayError = error?.message ?? blockingIssue?.message;
  const loginDisabled = loading || isMisconfigured || Boolean(blockingIssue);

  return (
    <div className="lark-login-shell relative min-h-screen font-grotesk flex flex-col overflow-hidden">
      {/* Remount on theme change so CSS loop animations restart */}
      <AmbientBackground key={`ambient-${resolvedTheme}`} />

      <header className="lark-login-header relative z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="lark-login-glow w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--lark-violet), #4C1D95)',
              boxShadow: '0 0 16px var(--lark-violet-glow)',
            }}
          >
            <LarkMark />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight transition-colors duration-300" style={{ color: 'var(--lark-text)' }}>
              Lark
              <span
                className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-widest align-middle transition-colors duration-300"
                style={{
                  background: 'var(--lark-violet-dim)',
                  color: 'var(--lark-violet-bright)',
                  border: '1px solid var(--lark-login-preview-border)',
                }}
              >
                Studio
              </span>
            </p>
            <p className="text-xs transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
              {STUDIO_NAV_TAGLINE}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-10 lg:py-14">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
          <div className="lark-login-panel rounded-2xl p-8 lg:p-10 flex flex-col justify-center backdrop-blur-md">
            <h1 className="text-3xl font-bold tracking-tight mb-3 leading-tight transition-colors duration-300" style={{ color: 'var(--lark-text)' }}>
              Hum an idea.
              <br />
              <span style={{ color: 'var(--lark-violet-bright)' }}>Play it in Studio.</span>
            </h1>
            <p className="text-sm mb-6 leading-relaxed transition-colors duration-300" style={{ color: 'var(--lark-text-muted)' }}>
              Turn a melody into a playable Audiotool project in seconds — no DAW setup required.
            </p>

            <MobileFlowStrip />

            {displayError && (
              <div
                className="mb-4 p-3 rounded-lg text-xs leading-relaxed"
                style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
              >
                {displayError}
              </div>
            )}

            {infoIssue && !displayError && (
              <div
                className="mb-4 p-3 rounded-lg text-xs leading-relaxed transition-colors duration-300"
                style={{ background: 'var(--lark-violet-dim)', color: 'var(--lark-violet-bright)', border: '1px solid var(--lark-login-preview-border)' }}
              >
                {infoIssue.message}
              </div>
            )}

            <button
              type="button"
              onClick={() => onLogin?.()}
              disabled={loginDisabled}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: loginDisabled ? 'var(--lark-violet-dim)' : 'linear-gradient(135deg, var(--lark-violet), #6D28D9)',
                color: '#fff',
                boxShadow: loginDisabled ? 'none' : '0 8px 32px var(--lark-violet-glow)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting to Audiotool…
                </>
              ) : (
                'Log in with Audiotool'
              )}
            </button>

            <p className="mt-5 text-center text-[11px] leading-relaxed transition-colors duration-300" style={{ color: 'var(--lark-text-subtle)' }}>
              Sign in once — then record, convert, and open projects in Studio.
            </p>
          </div>

          <TransformDemo key={`demo-${resolvedTheme}`} />
        </div>
      </main>
    </div>
  );
}
