import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAccessibility } from '@/lib/AccessibilityContext';
import {
  ONBOARDING_STEPS,
  completeOnboarding,
} from '@/lib/lark-onboarding';

const PAD = 10;
const TOOLTIP_GAP = 14;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function LarkOnboarding({
  open,
  onClose,
  targets = {},
}) {
  const { settings } = useAccessibility();
  const reduceMotion = settings.reduceMotion;
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const step = ONBOARDING_STEPS[stepIndex];
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  const isFirst = stepIndex === 0;

  const measure = useCallback(() => {
    if (!step?.target) {
      setSpotlight(null);
      setTooltipPos({
        top: Math.max(24, window.innerHeight * 0.22),
        left: Math.max(16, (window.innerWidth - 360) / 2),
      });
      return;
    }

    const el = targets[step.target]?.current;
    if (!el) {
      setSpotlight(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setSpotlight({
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
    });

    const tooltipWidth = Math.min(360, window.innerWidth - 32);
    const tooltipHeight = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.right;

    let top;
    let left;

    if (step.target === 'transform' || rect.height < 160) {
      left = clamp(
        rect.left + rect.width / 2 - tooltipWidth / 2,
        16,
        window.innerWidth - tooltipWidth - 16,
      );
      top = spaceBelow > tooltipHeight + 16
        ? rect.bottom + TOOLTIP_GAP
        : Math.max(16, rect.top - TOOLTIP_GAP - tooltipHeight);
    } else if (rect.height > 240 && spaceRight > tooltipWidth + 24) {
      top = clamp(rect.top, 16, window.innerHeight - tooltipHeight - 16);
      left = rect.right + TOOLTIP_GAP;
    } else {
      left = clamp(
        rect.left + rect.width / 2 - tooltipWidth / 2,
        16,
        window.innerWidth - tooltipWidth - 16,
      );
      top = spaceBelow > tooltipHeight + 16
        ? rect.bottom + TOOLTIP_GAP
        : Math.max(16, rect.top - TOOLTIP_GAP - tooltipHeight);
    }

    setTooltipPos({ top, left });
  }, [step, targets]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const el = step?.target ? targets[step.target]?.current : null;
    let scrollTimer;

    const runMeasure = () => measure();

    if (el && step.target === 'transform') {
      el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      if (!reduceMotion) {
        scrollTimer = setTimeout(runMeasure, 320);
      }
    }

    if (!scrollTimer) runMeasure();

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      clearTimeout(scrollTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, measure, stepIndex, step, targets, reduceMotion]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  if (!open || !step) return null;

  const handleFinish = () => {
    completeOnboarding();
    onClose?.();
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const tooltipWidth = Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 32 : 360);

  return (
    <div className="fixed inset-0 z-[400]" role="dialog" aria-modal="true" aria-label="Lark onboarding">
      {!step.target && (
        <button
          type="button"
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={handleFinish}
          aria-label="Close onboarding"
        />
      )}

      {spotlight && (
        <>
          <div
            className="fixed pointer-events-none rounded-2xl"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
              border: '2px solid rgba(139,92,246,0.55)',
              transition: reduceMotion ? 'none' : 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
            }}
          />
          <div
            className="fixed rounded-2xl pointer-events-none"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: '0 0 24px rgba(139,92,246,0.35)',
            }}
          />
        </>
      )}

      <div
        className="fixed z-[401] rounded-2xl p-4 shadow-2xl"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: tooltipWidth,
          background: 'var(--lark-card)',
          border: '1px solid rgba(139,92,246,0.35)',
          transition: reduceMotion ? 'none' : 'top 0.25s ease, left 0.25s ease',
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--lark-violet-bright)' }}>
            {stepIndex + 1} / {ONBOARDING_STEPS.length}
          </p>
          <button
            type="button"
            onClick={handleFinish}
            className="p-1 rounded-md"
            style={{ color: 'var(--lark-text-muted)' }}
            aria-label="Skip tour"
          >
            <X size={14} />
          </button>
        </div>

        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--lark-text)' }}>
          {step.title}
        </h2>
        <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--lark-text-muted)' }}>
          {step.body}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.id}
                className="rounded-full transition-all"
                style={{
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  background: i === stepIndex
                    ? 'var(--lark-violet-bright)'
                    : 'rgba(128,128,128,0.35)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium flex items-center gap-1"
                style={{
                  color: 'var(--lark-text-muted)',
                  border: '1px solid var(--lark-border)',
                }}
              >
                <ChevronLeft size={12} />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1"
              style={{
                background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                color: '#fff',
                border: '1px solid rgba(139,92,246,0.4)',
              }}
            >
              {isLast ? 'Start humming' : 'Next'}
              {!isLast && <ChevronRight size={12} />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFinish}
          className="mt-3 w-full text-[10px] py-1"
          style={{ color: 'var(--lark-text-subtle)' }}
        >
          Skip tour
        </button>
      </div>
    </div>
  );
}
