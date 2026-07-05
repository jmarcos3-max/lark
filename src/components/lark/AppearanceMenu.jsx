import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Palette,
  Contrast,
  Move,
  Bold,
  Focus,
  Type,
  Compass,
} from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { TEXT_SIZE_OPTIONS, useAccessibility } from '@/lib/AccessibilityContext';
import { requestOnboardingReplay } from '@/lib/lark-onboarding';

const THEME_OPTIONS = [
  { value: 'day', label: 'Day', Icon: Sun },
  { value: 'night', label: 'Night', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

const A11Y_TOGGLES = [
  {
    key: 'highContrast',
    label: 'High contrast',
    description: 'Stronger text and borders',
    Icon: Contrast,
  },
  {
    key: 'reduceMotion',
    label: 'Reduce motion',
    description: 'Minimize animations',
    Icon: Move,
  },
  {
    key: 'boldText',
    label: 'Bold text',
    description: 'Heavier labels and body copy',
    Icon: Bold,
  },
  {
    key: 'enhancedFocus',
    label: 'Enhanced focus',
    description: 'Clearer keyboard focus rings',
    Icon: Focus,
  },
];

function SectionLabel({ children }) {
  return (
    <p
      className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: 'var(--lark-text-subtle)' }}
    >
      {children}
    </p>
  );
}

function ToggleRow({ label, description, checked, onChange, Icon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
      style={{
        background: checked ? 'rgba(139,92,246,0.08)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!checked) e.currentTarget.style.background = 'rgba(128,128,128,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = checked ? 'rgba(139,92,246,0.08)' : 'transparent';
      }}
    >
      <Icon size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--lark-text-muted)' }} />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium" style={{ color: 'var(--lark-text)' }}>
          {label}
        </span>
        <span className="block text-[10px] leading-snug mt-0.5" style={{ color: 'var(--lark-text-muted)' }}>
          {description}
        </span>
      </span>
      <span
        className="shrink-0 w-8 h-[18px] rounded-full relative transition-colors mt-0.5"
        style={{
          background: checked ? 'var(--lark-violet)' : 'rgba(128,128,128,0.25)',
        }}
        aria-hidden="true"
      >
        <span
          className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
          style={{
            left: checked ? 'calc(100% - 16px)' : '2px',
          }}
        />
      </span>
    </button>
  );
}

export default function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  const { settings, patchSettings } = useAccessibility();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return undefined;
    }

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 260;
      setMenuPos({
        top: rect.bottom + 8,
        left: Math.max(8, rect.right - menuWidth),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Appearance and accessibility"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
        style={{
          background: open ? 'rgba(139,92,246,0.15)' : 'rgba(128,128,128,0.08)',
          border: `1px solid ${open ? 'rgba(139,92,246,0.4)' : 'var(--lark-border)'}`,
          color: open ? 'var(--lark-violet-bright)' : 'var(--lark-text-muted)',
        }}
      >
        <Palette size={13} />
      </button>

      {open && menuPos && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Appearance and accessibility"
            className="fixed rounded-xl overflow-hidden z-[201]"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              background: 'var(--lark-card)',
              border: '1px solid var(--lark-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              width: '260px',
              maxHeight: 'min(85vh, 520px)',
              overflowY: 'auto',
            }}
          >
            <div
              className="px-3 py-2.5 border-b"
              style={{ borderColor: 'var(--lark-border)' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--lark-text)' }}>
                Appearance
              </p>
            </div>

            <SectionLabel>Theme</SectionLabel>
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-all"
                style={{
                  color: theme === value ? 'var(--lark-violet-bright)' : 'var(--lark-text-muted)',
                  background: theme === value ? 'rgba(139,92,246,0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (theme !== value) e.currentTarget.style.background = 'rgba(128,128,128,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = theme === value ? 'rgba(139,92,246,0.1)' : 'transparent';
                }}
              >
                <Icon size={12} />
                {label}
                {theme === value && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />}
              </button>
            ))}

            <SectionLabel>Text size</SectionLabel>
            <div className="px-3 pb-2 flex gap-1.5" role="radiogroup" aria-label="Text size">
              {TEXT_SIZE_OPTIONS.map(({ value, label }) => {
                const selected = settings.textSize === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patchSettings({ textSize: value })}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all"
                    style={{
                      background: selected ? 'rgba(139,92,246,0.12)' : 'rgba(128,128,128,0.06)',
                      border: selected
                        ? '1px solid rgba(139,92,246,0.4)'
                        : '1px solid var(--lark-border)',
                      color: selected ? 'var(--lark-violet-bright)' : 'var(--lark-text-muted)',
                    }}
                  >
                    <Type
                      size={value === 'small' ? 11 : value === 'large' ? 15 : 13}
                    />
                    {label}
                  </button>
                );
              })}
            </div>

            <SectionLabel>Accessibility</SectionLabel>
            {A11Y_TOGGLES.map(({ key, label, description, Icon }) => (
              <ToggleRow
                key={key}
                label={label}
                description={description}
                checked={settings[key]}
                onChange={(next) => patchSettings({ [key]: next })}
                Icon={Icon}
              />
            ))}

            <SectionLabel>Help</SectionLabel>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestOnboardingReplay();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
              style={{ color: 'var(--lark-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(128,128,128,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Compass size={13} className="shrink-0" style={{ color: 'var(--lark-violet-bright)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--lark-text)' }}>
                Replay onboarding tour
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
