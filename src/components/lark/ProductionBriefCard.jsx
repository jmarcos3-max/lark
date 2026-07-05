import React from 'react';
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  PRODUCTION_BRIEF_TAGLINE,
  PRODUCTION_BRIEF_TITLE,
} from '@/lib/lark-copy';

export default function ProductionBriefCard({
  briefText,
  onBriefChange,
  onRefreshBrief,
  onApplySuggestions,
  isAnalyzing,
  analyzeStatus,
  analyzeError,
  suggestions,
  suggestionChips = [],
  hasAudio,
  hasAppliedStudio,
  hasConnectedProject,
  isProjectBusy,
  isProcessing,
  onHint,
  projectError,
}) {
  const busy = isProjectBusy || isProcessing || isAnalyzing;

  const handleApply = () => {
    if (!suggestions) {
      onHint?.('Analyze your hum first — record or import audio.');
      return;
    }
    if (!hasConnectedProject) {
      onHint?.('Select or create an Audiotool project first (Studio column, Step 2).');
      return;
    }
    onApplySuggestions?.(suggestions);
  };

  return (
    <div
      className="lark-card-glass rounded-2xl p-4 flex flex-col gap-3 shrink-0"
      style={{ border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-1.5 h-5 rounded-full shrink-0"
            style={{ background: 'linear-gradient(to bottom, #8B5CF6, #4C1D95)' }}
          />
          <div className="min-w-0">
            <span
              className="text-xs font-semibold uppercase tracking-widest block"
              style={{ color: 'var(--lark-text-muted)' }}
            >
              {PRODUCTION_BRIEF_TITLE}
            </span>
            <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--lark-text-subtle)' }}>
              {PRODUCTION_BRIEF_TAGLINE}
            </p>
          </div>
        </div>
        <Sparkles size={14} style={{ color: 'var(--lark-violet-bright)', opacity: 0.7 }} />
      </div>

      {!hasAudio ? (
        <p
          className="text-[10px] px-2 py-3 rounded-lg text-center"
          style={{
            color: 'var(--lark-text-subtle)',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.08)',
          }}
        >
          Record or import humming to generate a brief.
        </p>
      ) : (
        <>
          {suggestionChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestionChips.map((chip) => (
                <span
                  key={chip}
                  className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'rgba(139,92,246,0.12)',
                    border: '1px solid rgba(139,92,246,0.25)',
                    color: 'var(--lark-violet-bright)',
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          {suggestions && (
            <p className="text-[10px] px-2 py-1.5 rounded-lg leading-relaxed" style={{ color: 'var(--lark-text-muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Suggested Studio: <strong>{suggestions.instrument}</strong>
              {suggestions.mood ? ` · ${suggestions.mood}` : ''}
              {suggestions.studioLayers?.length
                ? ` · layers: ${suggestions.studioLayers.join(', ')}`
                : ''}
              {hasAppliedStudio ? (
                <span style={{ color: '#86efac' }}> · applied</span>
              ) : null}
            </p>
          )}

          <div className="relative">
            <textarea
              value={briefText}
              onChange={(e) => onBriefChange?.(e.target.value)}
              disabled={isAnalyzing}
              rows={8}
              placeholder={isAnalyzing ? 'Analyzing your hum…' : 'Production brief will appear here…'}
              className="w-full rounded-xl text-[11px] leading-relaxed p-3 outline-none resize-y min-h-[140px]"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(139,92,246,0.2)',
                color: 'var(--lark-text)',
                opacity: isAnalyzing ? 0.7 : 1,
              }}
            />
            {isAnalyzing && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none"
                style={{ background: 'rgba(0,0,0,0.25)' }}
              >
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--lark-violet-bright)' }}>
                  <Loader2 size={14} className="animate-spin" />
                  {analyzeStatus || 'Analyzing…'}
                </div>
              </div>
            )}
          </div>

          {(analyzeError || projectError) && (
            <p className="text-[10px] px-2 py-1.5 rounded-lg" style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {analyzeError || projectError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRefreshBrief?.()}
              disabled={busy}
              className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-semibold disabled:opacity-60"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--lark-text-muted)',
              }}
            >
              <RefreshCw size={12} className={isAnalyzing ? 'animate-spin' : ''} />
              Refresh from hum
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || !suggestions}
              title={
                !suggestions
                  ? 'Wait for analysis'
                  : !hasConnectedProject
                    ? 'Select or create a project in Studio first'
                    : 'Apply instrument, mood, and layers to Studio'
              }
              className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-bold disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                border: '1px solid rgba(139,92,246,0.4)',
                color: '#fff',
                boxShadow: '0 0 16px rgba(139,92,246,0.2)',
              }}
            >
              <Wand2 size={12} />
              Apply to Studio
            </button>
          </div>
        </>
      )}
    </div>
  );
}
