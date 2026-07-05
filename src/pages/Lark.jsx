import React, { useCallback, useEffect, useRef, useState } from 'react';
import LarkNavbar from '@/components/lark/LarkNavbar';
import LarkLoginView from '@/components/lark/LarkLoginView';
import LarkOnboarding from '@/components/lark/LarkOnboarding';
import AudioCaptureCard from '@/components/lark/AudioCaptureCard';
import ParameterMatrixCard from '@/components/lark/ParameterMatrixCard';
import ProductionBriefCard from '@/components/lark/ProductionBriefCard';
import StudioHealthCard from '@/components/lark/StudioHealthCard';
import ProjectLibraryPanel from '@/components/lark/ProjectLibraryPanel';
import { addRawAudioEntry, getRawAudioBlob } from '@/lib/raw-audio-library';
import { useAudiotool } from '@/lib/AudiotoolContext';
import { sanitizeStudioLayers } from '@/lib/lark-instruments';
import {
  isGmPresetInstrument,
  normalizeGmPresetSlug,
} from '@/lib/nexus-gm-presets';
import { studioUrlForProject } from '@/lib/lark-project-metadata';
import { openStudioAfterTransform, onLarkProjectChanged } from '@/lib/open-audiotool-studio';
import { useAudiotoolProjects } from '@/lib/useAudiotoolProjects';
import { useProductionBrief } from '@/lib/useProductionBrief';
import {
  isOnboardingComplete,
  ONBOARDING_REPLAY_EVENT,
} from '@/lib/lark-onboarding';

export default function Lark() {
  const {
    isAuthenticated,
    isLoading,
    isMisconfigured,
    login,
    error,
    setupIssues,
  } = useAudiotool();

  if (isLoading) {
    return (
      <LarkLoginView
        loading
        onLogin={login}
        error={error}
        setupIssues={setupIssues}
        isMisconfigured={isMisconfigured}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LarkLoginView
        onLogin={login}
        error={error}
        setupIssues={setupIssues}
        isMisconfigured={isMisconfigured}
      />
    );
  }

  return <LarkWorkspace />;
}

function LarkWorkspace() {
  const { client: audiotoolClient } = useAudiotool();
  const {
    larkProject,
    patchLarkProject,
    cloudProjects,
    isProjectBusy,
    projectError,
    isAuthenticated,
    login,
    refreshProjectList,
    createNewProject,
    openProject,
    saveProject,
    deleteCloudProject,
    renameProject,
    transformHummingToInstrument,
    setProjectError,
    projectSuccess,
    transformStatus,
  } = useAudiotoolProjects();

  const [isProcessing, setIsProcessing] = useState(false);
  const [outputUrl, setOutputUrl] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [importedAudio, setImportedAudio] = useState(null);
  const [activeRawAudioId, setActiveRawAudioId] = useState(null);
  const [studioHealthReport, setStudioHealthReport] = useState(null);
  const [briefApplied, setBriefApplied] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => !isOnboardingComplete());
  const captureColumnRef = useRef(null);
  const studioColumnRef = useRef(null);
  const briefColumnRef = useRef(null);
  const transformSectionRef = useRef(null);
  const onboardingTargets = {
    capture: captureColumnRef,
    studio: studioColumnRef,
    brief: briefColumnRef,
    transform: transformSectionRef,
  };
  const importBlobUrlRef = useRef(null);
  const larkProjectRef = useRef(larkProject);
  /** Session humming — survives project switches (cloud metadata may not store blob URLs). */
  const activeHumRef = useRef({ url: null, blob: null });

  larkProjectRef.current = larkProject;

  const getActiveHumSource = useCallback(() => {
    const url =
      larkProject.source_audio_url
      || importedAudio?.url
      || activeHumRef.current?.url
      || null;
    const blob = activeHumRef.current?.blob ?? null;
    return { url, blob };
  }, [larkProject.source_audio_url, importedAudio?.url]);

  const {
    analysis,
    briefText,
    isAnalyzing,
    analyzeStatus,
    analyzeError,
    handleBriefChange,
    handleRefreshBrief,
  } = useProductionBrief({
    getActiveHumSource,
    larkProject,
    patchLarkProject,
  });

  useEffect(() => {
    setBriefApplied(false);
  }, [larkProject.source_audio_url, analysis?.text]);

  useEffect(() => {
    const openTour = () => setOnboardingOpen(true);
    window.addEventListener(ONBOARDING_REPLAY_EVENT, openTour);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, openTour);
  }, []);

  const handleApplyBriefSuggestions = (suggestions) => {
    if (!suggestions) return;
    if (!larkProject.audiotoolName) {
      setProjectError('Select or create an Audiotool project first (Studio column, Step 2).');
      return;
    }
    patchLarkProject({
      target_instrument: suggestions.instrument,
      selected_mood: suggestions.mood,
      studio_layers: sanitizeStudioLayers(
        suggestions.studioLayers ?? [],
        suggestions.instrument,
      ),
    });
    setBriefApplied(true);
    setProjectError(null);
  };

  const revokeImportBlobUrl = useCallback(() => {
    if (importBlobUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(importBlobUrlRef.current);
    }
    importBlobUrlRef.current = null;
  }, []);

  useEffect(() => () => revokeImportBlobUrl(), [revokeImportBlobUrl]);

  const handleAudioReady = useCallback(async (url, meta = {}) => {
    if (!url) {
      revokeImportBlobUrl();
      setImportedAudio(null);
      setActiveRawAudioId(null);
      activeHumRef.current = { url: null, blob: null };
      patchLarkProject({ source_audio_url: null });
      return;
    }
    revokeImportBlobUrl();
    setImportedAudio(null);
    setActiveRawAudioId(null);
    const blob = meta.blob instanceof Blob ? meta.blob : null;
    activeHumRef.current = { url, blob };
    patchLarkProject({ source_audio_url: url });
    if (meta.saveToLibrary && meta.blob) {
      try {
        await addRawAudioEntry({
          blob: meta.blob,
          remoteUrl: url.startsWith('blob:') ? null : url,
          name: meta.name || 'Voice Recording',
          projectTitle: larkProject.title !== 'Untitled Track' ? larkProject.title : null,
        });
        setRefreshHistory((n) => n + 1);
      } catch {
        // IndexedDB unavailable — playback still works for current session via blob URL
      }
    }
  }, [patchLarkProject, larkProject.title, revokeImportBlobUrl]);

  const handleImportFromRawAudio = useCallback(async (entry) => {
    if (!entry?.id) return;
    setProjectError(null);
    const blob = await getRawAudioBlob(entry);
    if (!blob?.size) {
      setProjectError('Could not load that recording. Try re-recording or upload again.');
      return;
    }
    revokeImportBlobUrl();
    const url = URL.createObjectURL(blob);
    importBlobUrlRef.current = url;
    activeHumRef.current = { url, blob };
    setImportedAudio({ url, name: entry.name || 'Imported recording' });
    setActiveRawAudioId(entry.id);
    patchLarkProject({ source_audio_url: url });
    setOutputUrl(url);
  }, [patchLarkProject, revokeImportBlobUrl, setProjectError]);

  const handleInstrumentChange = (nextInstrument) => {
    const keepSlug = isGmPresetInstrument(nextInstrument)
      && larkProject.target_instrument === nextInstrument
      ? larkProject.gm_preset_slug
      : null;
    patchLarkProject({
      target_instrument: nextInstrument,
      studio_layers: sanitizeStudioLayers(larkProject.studio_layers, nextInstrument),
      gm_preset_slug: normalizeGmPresetSlug(nextInstrument, keepSlug),
    });
  };

  const handleGmPresetChange = (slug) => {
    patchLarkProject({
      gm_preset_slug: normalizeGmPresetSlug(larkProject.target_instrument, slug),
    });
  };

  const handleStudioLayerToggle = (layer) => {
    const current = larkProject.studio_layers ?? [];
    const next = current.includes(layer)
      ? current.filter((item) => item !== layer)
      : [...current, layer];
    patchLarkProject({
      studio_layers: sanitizeStudioLayers(next, larkProject.target_instrument),
    });
  };

  const handleMoodChange = (mood) => {
    patchLarkProject({ selected_mood: mood });
  };

  const handleNewProject = async (title) => {
    setOutputUrl(null);
    const name = title?.trim();
    if (!name) return;
    try {
      const created = await createNewProject({
        title: name,
        target_instrument: null,
        selected_mood: null,
        studio_layers: [],
        source_audio_url: null,
        elevenlabs_output_url: null,
      });
      if (created?.dawUrl) {
        onLarkProjectChanged(created.dawUrl);
      }
      setRefreshHistory((n) => n + 1);
    } catch {
      // error surfaced via projectError
    }
  };

  const handleOpenProject = async (projectName) => {
    setOutputUrl(null);
    const sessionHum = activeHumRef.current?.url
      ? { ...activeHumRef.current }
      : null;
    try {
      const opened = await openProject(projectName);
      if (opened?.dawUrl) {
        onLarkProjectChanged(opened.dawUrl);
      }
      if (sessionHum?.url) {
        patchLarkProject({ source_audio_url: sessionHum.url });
        setProjectError(null);
      }
      if (opened?.elevenlabs_output_url) {
        setOutputUrl(opened.elevenlabs_output_url);
      } else if (sessionHum?.url) {
        setOutputUrl(sessionHum.url);
      } else if (opened?.source_audio_url) {
        setOutputUrl(opened.source_audio_url);
      }
      setRefreshHistory((n) => n + 1);
    } catch {
      // error surfaced via projectError
    }
  };

  const handleSave = async () => {
    try {
      await saveProject({
        title: larkProject.title,
        target_instrument: larkProject.target_instrument,
        gm_preset_slug: larkProject.gm_preset_slug,
        selected_mood: larkProject.selected_mood,
        studio_layers: larkProject.studio_layers,
        wow_pass_layers: larkProject.wow_pass_layers,
        source_audio_url: larkProject.source_audio_url,
        elevenlabs_output_url: outputUrl ?? larkProject.elevenlabs_output_url,
      });
      setRefreshHistory((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  };

  const handleAutomate = async () => {
    const { url: sourceUrl, blob: sourceBlob } = getActiveHumSource();
    if (!sourceUrl) {
      setProjectError('Record or import humming first.');
      return;
    }

    const project = larkProjectRef.current;
    const dawUrl = project.dawUrl ?? studioUrlForProject(project.audiotoolName);

    setIsProcessing(true);
    setProjectError(null);
    try {
      const result = await transformHummingToInstrument({
        sourceUrl,
        sourceBlob,
        instrument: project.target_instrument,
        gmPresetSlug: project.gm_preset_slug,
        studioLayers: project.studio_layers,
        mood: project.selected_mood,
        audiotoolName: project.audiotoolName,
      });
      const studioUrl = result?.dawUrl ?? dawUrl;
      if (studioUrl) {
        openStudioAfterTransform(studioUrl);
      }
      if (result) {
        setStudioHealthReport({
          noteCount: result.noteCount ?? 0,
          leadNoteCount: result.leadNoteCount ?? result.noteCount ?? 0,
          layerCount: result.layerCount ?? 0,
          layersWritten: result.layersWritten ?? [],
          bpm: result.bpm ?? null,
          nexusCabled: Boolean(result.nexusCabled),
          instrument: larkProject.target_instrument,
          mood: larkProject.selected_mood,
          dawUrl: result.dawUrl ?? larkProject.dawUrl ?? null,
        });
      }
      if (result?.outputUrl) {
        setOutputUrl(result.outputUrl);
      } else if (larkProject.source_audio_url) {
        setOutputUrl(larkProject.source_audio_url);
      }
      setRefreshHistory((n) => n + 1);
    } catch {
      // error in projectError
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="min-h-screen font-grotesk"
      style={{ background: 'var(--lark-bg)', transition: 'background 0.3s ease' }}
    >
      <LarkNavbar />

      <LarkOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        targets={onboardingTargets}
      />

      <main className="px-6 pb-8 pt-4 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-12 gap-4 mb-4 items-start">
          <div ref={captureColumnRef} className="col-span-4 self-stretch">
            <AudioCaptureCard
              onAudioReady={handleAudioReady}
              importedAudio={importedAudio}
            />
          </div>

          <div ref={studioColumnRef} className="col-span-5 flex flex-col gap-4">
            <ParameterMatrixCard
              instrument={larkProject.target_instrument}
              mood={larkProject.selected_mood}
              onMoodChange={handleMoodChange}
              gmPresetSlug={larkProject.gm_preset_slug}
              studioLayers={larkProject.studio_layers ?? []}
              onInstrumentChange={handleInstrumentChange}
              onGmPresetChange={handleGmPresetChange}
              onStudioLayerToggle={handleStudioLayerToggle}
              onAutomate={handleAutomate}
              onNewProject={handleNewProject}
              onConnectProject={handleOpenProject}
              onSave={handleSave}
              isProcessing={isProcessing}
              isProjectBusy={isProjectBusy}
              projectError={projectError}
              projectSuccess={projectSuccess}
              transformStatus={transformStatus}
              isAuthenticated={isAuthenticated}
              onLogin={login}
              audiotoolClient={audiotoolClient}
              cloudProjects={cloudProjects}
              onRefreshProjects={refreshProjectList}
              hasAudio={Boolean(getActiveHumSource().url)}
              onTransformHint={setProjectError}
              hasInstrument={!!larkProject.target_instrument}
              currentProject={larkProject}
              activeProjectName={larkProject.audiotoolName}
              transformSectionRef={transformSectionRef}
            />
            <StudioHealthCard
              currentProject={larkProject}
              report={studioHealthReport}
              projectError={null}
            />
          </div>

          <div ref={briefColumnRef} className="col-span-3 flex flex-col gap-4">
            <ProductionBriefCard
              briefText={briefText}
              onBriefChange={handleBriefChange}
              onRefreshBrief={handleRefreshBrief}
              onApplySuggestions={handleApplyBriefSuggestions}
              isAnalyzing={isAnalyzing}
              analyzeStatus={analyzeStatus}
              analyzeError={analyzeError}
              suggestions={analysis?.suggestions ?? null}
              suggestionChips={analysis?.suggestions?.chips ?? []}
              hasAudio={Boolean(getActiveHumSource().url)}
              hasAppliedStudio={briefApplied}
              hasConnectedProject={Boolean(larkProject.audiotoolName)}
              isProjectBusy={isProjectBusy}
              isProcessing={isProcessing}
              projectError={projectError}
              onHint={setProjectError}
            />
          </div>
        </div>

        <div>
          <ProjectLibraryPanel
            refreshKey={refreshHistory}
            cloudProjects={cloudProjects}
            isAuthenticated={isAuthenticated}
            onLogin={login}
            onOpenProject={handleOpenProject}
            onRefreshProjects={refreshProjectList}
            onDeleteProject={deleteCloudProject}
            onRenameProject={renameProject}
            activeProjectName={larkProject.audiotoolName}
            onUseRawAudio={handleImportFromRawAudio}
            activeRawAudioId={activeRawAudioId}
          />
        </div>
      </main>
    </div>
  );
}
