import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAudioBlob } from '@/lib/elevenlabs-api';
import {
  analyzeHumForBrief,
  refreshBriefFromSelections,
} from '@/lib/production-brief';

/**
 * Manages production brief state: auto-analyze on new hum, manual refresh, edits.
 */
export function useProductionBrief({
  getActiveHumSource,
  larkProject,
  patchLarkProject,
}) {
  const [analysis, setAnalysis] = useState(null);
  const [briefText, setBriefText] = useState(larkProject.production_brief ?? '');
  const [briefEdited, setBriefEdited] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const analyzeTokenRef = useRef(0);
  const lastAudioKeyRef = useRef(null);

  const audioKey = larkProject.source_audio_url ?? '';

  useEffect(() => {
    if (larkProject.production_brief && !briefEdited) {
      setBriefText(larkProject.production_brief);
    }
  }, [larkProject.production_brief, briefEdited]);

  const persistBrief = useCallback((text) => {
    patchLarkProject({ production_brief: text || null });
  }, [patchLarkProject]);

  const runAnalyze = useCallback(async ({ force = false } = {}) => {
    const { url, blob } = getActiveHumSource();
    if (!url && !blob) {
      setAnalysis(null);
      setAnalyzeError(null);
      return null;
    }

    if (!force && briefEdited && analysis) {
      return analysis;
    }

    const token = ++analyzeTokenRef.current;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeStatus('Starting…');

    try {
      const audioBlob = await fetchAudioBlob(url, blob);
      const result = await analyzeHumForBrief(audioBlob, {
        onProgress: setAnalyzeStatus,
      });

      if (token !== analyzeTokenRef.current) return null;

      setAnalysis(result);
      setBriefText(result.text);
      setBriefEdited(false);
      persistBrief(result.text);
      setAnalyzeStatus(null);
      return result;
    } catch (err) {
      if (token !== analyzeTokenRef.current) return null;
      const message = err instanceof Error ? err.message : String(err);
      setAnalyzeError(message);
      setAnalyzeStatus(null);
      return null;
    } finally {
      if (token === analyzeTokenRef.current) {
        setIsAnalyzing(false);
      }
    }
  }, [getActiveHumSource, briefEdited, analysis, persistBrief]);

  useEffect(() => {
    if (!audioKey) {
      lastAudioKeyRef.current = null;
      setAnalysis(null);
      setAnalyzeError(null);
      setBriefEdited(false);
      setBriefText('');
      return;
    }

    if (audioKey === lastAudioKeyRef.current) return;
    lastAudioKeyRef.current = audioKey;
    setBriefEdited(false);
    runAnalyze({ force: true });
  }, [audioKey, runAnalyze]);

  const handleBriefChange = useCallback((text) => {
    setBriefText(text);
    setBriefEdited(true);
    persistBrief(text);
  }, [persistBrief]);

  const handleRefreshBrief = useCallback(() => {
    setBriefEdited(false);
    return runAnalyze({ force: true });
  }, [runAnalyze]);

  const handleSyncBriefToStudio = useCallback(() => {
    if (!analysis && !briefText) return null;
    const text = refreshBriefFromSelections(analysis, {
      instrument: larkProject.target_instrument ?? analysis?.suggestions?.instrument,
      mood: larkProject.selected_mood ?? analysis?.suggestions?.mood,
      studioLayers: larkProject.studio_layers?.length
        ? larkProject.studio_layers
        : analysis?.suggestions?.studioLayers,
    });
    setBriefText(text);
    setBriefEdited(true);
    persistBrief(text);
    return text;
  }, [
    analysis,
    briefText,
    larkProject.target_instrument,
    larkProject.selected_mood,
    larkProject.studio_layers,
    persistBrief,
  ]);

  return {
    analysis,
    briefText,
    briefEdited,
    isAnalyzing,
    analyzeStatus,
    analyzeError,
    handleBriefChange,
    handleRefreshBrief,
    handleSyncBriefToStudio,
    runAnalyze,
  };
}
