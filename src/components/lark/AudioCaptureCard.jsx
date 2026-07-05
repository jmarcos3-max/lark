import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, FileAudio, CheckCircle, Play, Pause, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import LarkStepLabel from '@/components/lark/LarkStepLabel';
import {
  isHumCleaningEnabled,
  setHumCleaningEnabled,
} from '@/lib/hum-audio-prep';

const UPLOAD_TIMEOUT_MS = 25_000;
const RECORD_TIMESLICE_MS = 100;
const MIN_RECORD_MS = 400;

function getSupportedRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionForMime(mimeType) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function isBase44UploadEnabled() {
  return Boolean(appParams.appId && appParams.appBaseUrl);
}

async function uploadToCloud(file) {
  const result = await Promise.race([
    base44.integrations.Core.UploadFile({ file }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Upload timed out — check Base44 config')), UPLOAD_TIMEOUT_MS);
    }),
  ]);
  if (!result?.file_url) {
    throw new Error('Upload did not return a file URL');
  }
  return result.file_url;
}

// Generates fake waveform data for visual display
const generateWaveform = (seed = 42, points = 80) => {
  const arr = [];
  let val = 0.5;
  for (let i = 0; i < points; i++) {
    val += (Math.sin(i * 0.4 + seed) * 0.15 + (Math.random() - 0.5) * 0.25);
    val = Math.max(0.08, Math.min(1, val));
    arr.push(val);
  }
  return arr;
};

const WaveformBars = () => (
  <div className="flex items-center justify-center gap-0.5 h-8">
    {[0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.4, 0.7, 1, 0.6, 0.3, 0.8].map((h, i) => (
      <div
        key={i}
        className="w-0.5 rounded-full wave-bar"
        style={{
          height: `${h * 100}%`,
          background: 'linear-gradient(to top, #7C3AED, #A78BFA)',
          '--dur': `${0.5 + i * 0.07}s`,
          animationDelay: `${i * 0.05}s`,
          transformOrigin: 'bottom',
        }}
      />
    ))}
  </div>
);

function WaveformTrimmer({ audioUrl, onReset }) {
  const [waveform] = useState(() => generateWaveform(Date.now() % 100));
  const [leftTrim, setLeftTrim] = useState(0.05);
  const [rightTrim, setRightTrim] = useState(0.92);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState(null); // 'left' | 'right'
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const TOTAL_DURATION = 8.0;

  const trimStart = (leftTrim * TOTAL_DURATION).toFixed(1);
  const trimEnd = (rightTrim * TOTAL_DURATION).toFixed(1);

  const handleMouseDown = (handle) => (e) => {
    e.preventDefault();
    setDragging(handle);
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (dragging === 'left') setLeftTrim(Math.min(ratio, rightTrim - 0.08));
      if (dragging === 'right') setRightTrim(Math.max(ratio, leftTrim + 0.08));
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, leftTrim, rightTrim]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = leftTrim * TOTAL_DURATION;
      audioRef.current.play();
      setIsPlaying(true);
      const endTime = rightTrim * TOTAL_DURATION;
      const check = setInterval(() => {
        if (audioRef.current && audioRef.current.currentTime >= endTime) {
          audioRef.current.pause();
          setIsPlaying(false);
          clearInterval(check);
        }
      }, 100);
    }
  };

  return (
    <div className="flex flex-col flex-1 gap-3">
      <audio ref={audioRef} src={audioUrl} />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--lark-text-muted)' }}>
          Edit Recording
        </span>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-[10px] font-medium transition-colors"
          style={{ color: 'var(--lark-text-subtle)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#F87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--lark-text-subtle)'}
        >
          <RotateCcw size={10} />
          New recording
        </button>
      </div>

      {/* Waveform + trim handles */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden select-none"
        style={{ height: '72px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        {/* Dimmed regions outside trim */}
        <div
          className="absolute top-0 bottom-0 left-0 z-10 pointer-events-none"
          style={{ width: `${leftTrim * 100}%`, background: 'rgba(8,8,8,0.6)' }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 z-10 pointer-events-none"
          style={{ width: `${(1 - rightTrim) * 100}%`, background: 'rgba(8,8,8,0.6)' }}
        />

        {/* Waveform bars */}
        <div className="absolute inset-0 flex items-center px-1 gap-px">
          {waveform.map((h, i) => {
            const pos = i / waveform.length;
            const active = pos >= leftTrim && pos <= rightTrim;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h * 80}%`,
                  background: active
                    ? `linear-gradient(to top, #7C3AED, #A78BFA)`
                    : 'rgba(139,92,246,0.2)',
                  transition: 'background 0.1s',
                }}
              />
            );
          })}
        </div>

        {/* Left Handle */}
        <div
          className="absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-ew-resize"
          style={{ left: `${leftTrim * 100}%`, width: '14px', transform: 'translateX(-7px)' }}
          onMouseDown={handleMouseDown('left')}
          onTouchStart={handleMouseDown('left')}
        >
          <div className="w-0.5 h-full rounded-full" style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }} />
          <div className="absolute w-3 h-5 rounded flex items-center justify-center" style={{ background: '#7C3AED', boxShadow: '0 0 8px rgba(139,92,246,0.6)' }}>
            <div className="flex flex-col gap-0.5">{[0,1,2].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-white opacity-60" />)}</div>
          </div>
        </div>

        {/* Right Handle */}
        <div
          className="absolute top-0 bottom-0 z-20 flex items-center justify-center cursor-ew-resize"
          style={{ left: `${rightTrim * 100}%`, width: '14px', transform: 'translateX(-7px)' }}
          onMouseDown={handleMouseDown('right')}
          onTouchStart={handleMouseDown('right')}
        >
          <div className="w-0.5 h-full rounded-full" style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }} />
          <div className="absolute w-3 h-5 rounded flex items-center justify-center" style={{ background: '#7C3AED', boxShadow: '0 0 8px rgba(139,92,246,0.6)' }}>
            <div className="flex flex-col gap-0.5">{[0,1,2].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-white opacity-60" />)}</div>
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            background: isPlaying ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.4)',
            color: 'var(--lark-violet-bright)',
          }}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <span className="text-[11px] font-mono" style={{ color: 'var(--lark-text-muted)' }}>
          Trimmed: {trimStart}s – {trimEnd}s
        </span>
        <span className="text-[11px] font-mono ml-auto" style={{ color: 'var(--lark-text-subtle)' }}>
          {(parseFloat(trimEnd) - parseFloat(trimStart)).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}

function HumCleanToggle() {
  const [enabled, setEnabled] = useState(() => isHumCleaningEnabled());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setHumCleaningEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full mt-3 py-2 px-3 rounded-xl flex items-center justify-between text-[10px] transition-all"
      style={{
        background: enabled ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
        border: enabled
          ? '1px solid rgba(56,189,248,0.3)'
          : '1px solid rgba(255,255,255,0.08)',
        color: enabled ? '#7DD3FC' : 'var(--lark-text-muted)',
      }}
      title="High-pass, noise gate, and normalize before Basic Pitch / MusicGen"
    >
      <span>Clean hum for analysis</span>
      <span className="font-mono uppercase tracking-wider">{enabled ? 'On' : 'Off'}</span>
    </button>
  );
}

export default function AudioCaptureCard({ onAudioReady, importedAudio }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [capturedAudioUrl, setCapturedAudioUrl] = useState(null);
  const [capturedFileName, setCapturedFileName] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [micError, setMicError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const localBlobUrlRef = useRef(null);
  const captureBusyRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const mimeTypeRef = useRef('audio/webm');
  const recordStartedAtRef = useRef(0);

  const isCaptureStale = (generation) => generation !== captureGenerationRef.current;

  const revokeLocalUrl = () => {
    if (localBlobUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(localBlobUrlRef.current);
    }
    localBlobUrlRef.current = null;
  };

  useEffect(() => () => {
    revokeLocalUrl();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!importedAudio?.url) return;
    captureGenerationRef.current += 1;
    captureBusyRef.current = false;
    setIsUploading(false);
    setIsSyncingCloud(false);
    setMicError(null);
    setUploadError(null);
    revokeLocalUrl();
    setCapturedAudioUrl(importedAudio.url);
    setCapturedFileName(importedAudio.name || 'Imported recording');
  }, [importedAudio?.url, importedAudio?.name]);

  const handleReset = () => {
    captureGenerationRef.current += 1;
    captureBusyRef.current = false;
    setIsUploading(false);
    setIsSyncingCloud(false);
    setMicError(null);
    setUploadError(null);
    revokeLocalUrl();
    setCapturedAudioUrl(null);
    setCapturedFileName(null);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    onAudioReady(null);
  };

  const finishCapture = useCallback(async (blob, displayName, fileForUpload) => {
    if (captureBusyRef.current) return;
    const generation = captureGenerationRef.current;
    captureBusyRef.current = true;
    setIsUploading(false);
    setUploadError(null);

    revokeLocalUrl();
    const localUrl = URL.createObjectURL(blob);
    localBlobUrlRef.current = localUrl;
    if (isCaptureStale(generation)) {
      URL.revokeObjectURL(localUrl);
      captureBusyRef.current = false;
      return;
    }
    setCapturedAudioUrl(localUrl);
    setCapturedFileName(displayName);
    onAudioReady(localUrl, { name: displayName, blob, saveToLibrary: true });

    if (!isBase44UploadEnabled()) {
      captureBusyRef.current = false;
      return;
    }

    setIsSyncingCloud(true);
    try {
      const cloudUrl = await uploadToCloud(fileForUpload);
      if (isCaptureStale(generation)) return;
      revokeLocalUrl();
      localBlobUrlRef.current = cloudUrl;
      setCapturedAudioUrl(cloudUrl);
      onAudioReady(cloudUrl, { name: displayName, blob, saveToLibrary: false });
    } catch (err) {
      if (isCaptureStale(generation)) return;
      const message = err instanceof Error ? err.message : 'Cloud upload failed';
      setUploadError(`${message}. Saved in Raw Audio on this device.`);
      onAudioReady(localUrl, { name: displayName, blob, saveToLibrary: false });
    } finally {
      if (!isCaptureStale(generation)) {
        setIsSyncingCloud(false);
      }
      captureBusyRef.current = false;
    }
  }, [onAudioReady]);

  const finalizeRecording = useCallback(() => {
    const mimeType = mimeTypeRef.current || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsUploading(false);

    if (blob.size === 0) {
      setMicError('No audio captured. Record for at least a second, then stop.');
      captureBusyRef.current = false;
      return;
    }

    const ext = extensionForMime(mimeType);
    const file = new File([blob], `recording.${ext}`, { type: mimeType });
    finishCapture(blob, 'Voice Recording', file);
  }, [finishCapture]);

  const startRecording = async () => {
    if (isUploading || captureBusyRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setMicError('Recording is not supported in this browser.');
      return;
    }

    setMicError(null);
    setUploadError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch {
      setMicError('Microphone access denied or no device found. Please check your browser permissions.');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    recordStartedAtRef.current = Date.now();

    const mimeType = getSupportedRecorderMimeType();
    mimeTypeRef.current = mimeType || 'audio/webm';
    const mr = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mimeTypeRef.current = mr.mimeType || mimeTypeRef.current;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onerror = () => {
      setIsUploading(false);
      setIsRecording(false);
      captureBusyRef.current = false;
      setMicError('Recording failed. Try again.');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    mr.onstop = () => {
      // Final chunk may arrive after onstop (Safari / Chrome)
      setTimeout(() => finalizeRecording(), 50);
    };

    try {
      mr.start(RECORD_TIMESLICE_MS);
    } catch {
      setMicError('Could not start recording. Try another browser or upload a file.');
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    mediaRecorderRef.current = mr;
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return;

    const elapsed = Date.now() - recordStartedAtRef.current;
    if (elapsed < MIN_RECORD_MS) {
      setMicError('Keep recording a little longer (about 1 second), then stop.');
    }

    setIsUploading(true);
    clearInterval(timerRef.current);
    setIsRecording(false);
    mediaRecorderRef.current = null;

    try {
      if (mr.state === 'recording') {
        mr.requestData();
        mr.stop();
      } else {
        setIsUploading(false);
      }
    } catch {
      setIsUploading(false);
      setMicError('Could not stop recording. Try again.');
      captureBusyRef.current = false;
    }
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleFile = useCallback(async (file) => {
    if (!file.type.startsWith('audio/')) return;
    if (captureBusyRef.current) return;
    setIsUploading(true);
    setUploadError(null);
    await finishCapture(file, file.name, file);
    setIsUploading(false);
  }, [finishCapture]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // === REVIEW STATE ===
  if (capturedAudioUrl) {
    return (
      <div className="lark-card-glass rounded-2xl p-5 h-full flex flex-col" style={{ minHeight: '340px' }}>
        <LarkStepLabel
          step={1}
          title="Hum or import audio"
          done
          className="mb-4"
        />
        <div className="flex items-center gap-1.5 text-[10px] mb-2 justify-end" style={{ color: '#86efac' }}>
          <CheckCircle size={11} style={{ color: '#4ade80' }} />
          {capturedFileName}
          {isSyncingCloud && (
            <span style={{ color: 'var(--lark-violet-bright)' }}> · syncing…</span>
          )}
        </div>
        {uploadError && (
          <p className="text-[10px] mb-2 leading-snug" style={{ color: '#fbbf24' }}>
            {uploadError}
          </p>
        )}
        <WaveformTrimmer audioUrl={capturedAudioUrl} onReset={handleReset} />

        <HumCleanToggle />

        <button
          type="button"
          onClick={handleReset}
          className="mt-4 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all duration-200"
          style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.35)',
            color: 'var(--lark-violet-bright)',
          }}
        >
          <Mic size={15} />
          New recording
        </button>
      </div>
    );
  }

  // === INITIAL / RECORDING STATE ===
  return (
    <div className="lark-card-glass rounded-2xl p-5 h-full flex flex-col" style={{ minHeight: '340px' }}>
      <LarkStepLabel
        step={1}
        title="Hum or import audio"
        done={Boolean(importedAudio?.url)}
        className="mb-5"
      />

      {/* Mic Button */}
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isUploading}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording ? 'recording-pulse' : 'hover:scale-105'}`}
          style={{
            background: isRecording
              ? 'radial-gradient(circle, rgba(239,68,68,0.3), rgba(220,38,38,0.1))'
              : 'radial-gradient(circle, rgba(139,92,246,0.25), rgba(76,29,149,0.1))',
            border: isRecording
              ? '2px solid rgba(239,68,68,0.6)'
              : '2px solid rgba(139,92,246,0.4)',
            boxShadow: isRecording
              ? '0 0 30px rgba(239,68,68,0.2)'
              : '0 0 20px rgba(139,92,246,0.15)',
          }}
        >
          {isRecording ? (
            <MicOff size={32} style={{ color: '#F87171' }} />
          ) : (
            <Mic size={32} style={{ color: 'var(--lark-violet-bright)' }} />
          )}
        </button>

        {isRecording && (
          <div className="flex flex-col items-center gap-2">
            <WaveformBars />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono font-medium" style={{ color: '#F87171' }}>
                {formatTime(recordingTime)}
              </span>
            </div>
          </div>
        )}

        {!isRecording && (
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--lark-text)' }}>
              {isUploading ? 'Processing...' : 'Record Voice Input'}
            </p>
            {micError ? (
              <p className="text-xs mt-1 max-w-[180px]" style={{ color: '#F87171' }}>{micError}</p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: 'var(--lark-text-muted)' }}>
                Click to record — speak for at least 1 second
              </p>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px" style={{ background: 'var(--lark-border)' }} />
        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--lark-text-subtle)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--lark-border)' }} />
      </div>

      {/* Drop Zone */}
      <div
        className="relative rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-all duration-200"
        style={{
          border: `1.5px dashed ${isDragging ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)'}`,
          background: isDragging ? 'rgba(139,92,246,0.06)' : 'transparent',
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.webm,.ogg"
          className="hidden"
          onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
        />
        {isUploading ? (
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <FileAudio size={20} style={{ color: isDragging ? 'var(--lark-violet-bright)' : 'var(--lark-text-muted)' }} />
        )}
        <p className="text-xs text-center" style={{ color: 'var(--lark-text-muted)' }}>
          {isUploading ? 'Uploading...' : 'Drop .wav or .mp3 file here'}
        </p>
      </div>

      <HumCleanToggle />
    </div>
  );
}