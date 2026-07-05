import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

async function decodeBlob(ctx, blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

/** Web Audio mixer for ElevenLabs instrumental render + optional mood layer MP3s. */
export function useWowPassPreview({ moodLayers = [], instrumentalRender = null }) {
  const ctxRef = useRef(null);
  const buffersRef = useRef([]);
  const gainsRef = useRef(new Map());
  const sourcesRef = useRef([]);
  const analyserRef = useRef(null);
  const masterGainRef = useRef(null);
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);
  const pauseAtRef = useRef(0);
  const playingRef = useRef(false);

  const [tracks, setTracks] = useState([]);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [meterLevels, setMeterLevels] = useState([]);

  const stopSources = useCallback(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current = [];
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !playingRef.current) return;

    const elapsed = ctx.currentTime - startedAtRef.current + pauseAtRef.current;
    setCurrentTime(Math.min(elapsed, duration || elapsed));

    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const bars = 32;
      const step = Math.floor(data.length / bars);
      const levels = Array.from({ length: bars }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
        return sum / step / 255;
      });
      setMeterLevels(levels);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      masterGain.connect(analyser);
      analyser.connect(ctx.destination);
      masterGainRef.current = masterGain;
      analyserRef.current = analyser;
      ctxRef.current = ctx;
    }
    return ctxRef.current;
  }, []);

  const previewLayers = useMemo(() => {
    const layers = [];
    if (instrumentalRender?.url) {
      layers.push({
        id: instrumentalRender.id,
        label: instrumentalRender.label ?? 'Your instrumental',
        url: instrumentalRender.url,
      });
    }
    return [...layers, ...moodLayers];
  }, [instrumentalRender, moodLayers]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      stopSources();
      stopMeter();
      playingRef.current = false;
      setIsPlaying(false);
      setCurrentTime(0);
      pauseAtRef.current = 0;

      if (!previewLayers.length) {
        buffersRef.current = [];
        gainsRef.current = new Map();
        setTracks([]);
        setDuration(0);
        setLoading(false);
        return;
      }

      try {
        const ctx = ensureContext();
        const nextTracks = [];
        let maxDuration = 0;

        for (const layer of previewLayers) {
          if (!layer?.url) continue;
          const res = await fetch(layer.url);
          if (!res.ok) continue;
          const buffer = await decodeBlob(ctx, await res.blob());
          if (cancelled) return;
          const volume = layer.label === 'Your instrumental'
            ? 0.92
            : layer.label === 'impact'
              ? 0.55
              : 0.68;
          nextTracks.push({
            id: layer.id,
            label: layer.label,
            buffer,
            volume,
            enabled: true,
          });
          maxDuration = Math.max(maxDuration, buffer.duration);
        }

        buffersRef.current = nextTracks;
        gainsRef.current = new Map();
        setTracks(nextTracks.map(({ id, label, volume, enabled }) => ({
          id, label, volume, enabled,
        })));
        tracksRef.current = nextTracks.map(({ id, label, volume, enabled }) => ({
          id, label, volume, enabled,
        }));
        setDuration(maxDuration);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load preview audio.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewLayers, ensureContext, stopSources, stopMeter]);

  useEffect(() => () => {
    stopSources();
    stopMeter();
    ctxRef.current?.close?.();
    ctxRef.current = null;
  }, [stopSources, stopMeter]);

  const startPlayback = useCallback(async (fromTime = pauseAtRef.current) => {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    stopSources();
    const master = masterGainRef.current;
    if (!master) return;

    const active = buffersRef.current.filter((t) => {
      const state = tracksRef.current.find((s) => s.id === t.id);
      return state?.enabled !== false;
    });

    if (!active.length) return;

    startedAtRef.current = ctx.currentTime;
    pauseAtRef.current = fromTime;

    for (const track of active) {
      const state = tracksRef.current.find((s) => s.id === track.id);
      const gainNode = ctx.createGain();
      gainNode.gain.value = state?.volume ?? track.volume;
      gainNode.connect(master);
      gainsRef.current.set(track.id, gainNode);

      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(gainNode);
      source.start(0, Math.min(fromTime, track.buffer.duration));
      sourcesRef.current.push(source);
    }

    playingRef.current = true;
    setIsPlaying(true);
    stopMeter();
    rafRef.current = requestAnimationFrame(tick);
  }, [ensureContext, stopSources, stopMeter, tick]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && playingRef.current) {
      pauseAtRef.current = ctx.currentTime - startedAtRef.current + pauseAtRef.current;
      setCurrentTime(pauseAtRef.current);
    }
    stopSources();
    stopMeter();
    playingRef.current = false;
    setIsPlaying(false);
    setMeterLevels([]);
  }, [stopSources, stopMeter]);

  const togglePlay = useCallback(async () => {
    if (playingRef.current) {
      pause();
    } else {
      await startPlayback();
    }
  }, [pause, startPlayback]);

  const seek = useCallback((time) => {
    const next = Math.max(0, Math.min(time, duration || 0));
    pauseAtRef.current = next;
    setCurrentTime(next);
    if (playingRef.current) {
      startPlayback(next);
    }
  }, [duration, pause, startPlayback]);

  const setTrackVolume = useCallback((id, volume) => {
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, volume } : t));
    tracksRef.current = next;
    setTracks(next);
    const gain = gainsRef.current.get(id);
    if (gain) gain.gain.value = volume;
  }, []);

  const toggleTrackEnabled = useCallback((id) => {
    const next = tracksRef.current.map((t) => (
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
    tracksRef.current = next;
    setTracks(next);
    if (playingRef.current) {
      const at = pauseAtRef.current;
      stopSources();
      playingRef.current = false;
      setIsPlaying(false);
      pauseAtRef.current = at;
      startPlayback(at);
    }
  }, [stopSources, startPlayback]);

  return {
    tracks,
    isPlaying,
    currentTime,
    duration,
    loading,
    loadError,
    meterLevels,
    togglePlay,
    seek,
    setTrackVolume,
    toggleTrackEnabled,
    hasAudio: tracks.length > 0,
  };
}
