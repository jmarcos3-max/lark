import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudiotool } from '@/lib/AudiotoolContext';
import {
  formatDeleteProjectError,
  getProjectDeleteBlockReason,
  unwrapAudiotoolResult,
} from '@/lib/audiotool-api';
import {
  composeMoodLayers,
  fetchAudioBlob,
  getAudioDurationMs,
} from '@/lib/elevenlabs-api';
import { renderInstrumentalFromHum } from '@/lib/music-render-api';
import {
  audiotoolProjectToLark,
  encodeLarkMetadata,
  emptyLarkProject,
  normalizeProjectResourceName,
  studioUrlForProject,
} from '@/lib/lark-project-metadata';
import { applyNotesWithLayers } from '@/lib/nexus-rhythm-notes';
import { waitForNexusSync } from '@/lib/nexus-sync';
import { importWowLayersToStudio } from '@/lib/nexus-import-wow-layers';
import { fetchGmPreset, normalizeGmPresetSlug } from '@/lib/nexus-gm-presets';
import { sanitizeStudioLayers, sanitizeWowPassLayers } from '@/lib/lark-instruments';
import { MOOD_LAYERS_NAME } from '@/lib/lark-copy';
import { humToneContextFromTranscription } from '@/lib/hum-tone-context';

export function useAudiotoolProjects() {
  const { client, isAuthenticated, login, isLoading: authLoading, userName } = useAudiotool();
  const documentRef = useRef(null);
  const openProjectNameRef = useRef(null);

  const [larkProject, setLarkProject] = useState(emptyLarkProject);
  const [cloudProjects, setCloudProjects] = useState([]);
  const [isProjectBusy, setIsProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState(null);
  const [projectSuccess, setProjectSuccess] = useState(null);
  const [transformStatus, setTransformStatus] = useState(null);
  const [moodLayers, setMoodLayers] = useState([]);
  const [instrumentalRender, setInstrumentalRender] = useState(null);
  const [isGeneratingMoodLayers, setIsGeneratingMoodLayers] = useState(false);
  const [isRenderingInstrumental, setIsRenderingInstrumental] = useState(false);
  const [renderStatus, setRenderStatus] = useState(null);
  const [isImportingWowLayers, setIsImportingWowLayers] = useState(false);
  const [wowImportStatus, setWowImportStatus] = useState(null);

  const patchLarkProject = useCallback((patch) => {
    setLarkProject((prev) => ({ ...prev, ...patch }));
  }, []);

  const closeCurrentDocument = useCallback(async () => {
    const doc = documentRef.current;
    documentRef.current = null;
    openProjectNameRef.current = null;
    if (doc) {
      try {
        await doc.stop();
      } catch {
        // ignore stop errors during teardown
      }
    }
  }, []);

  const releaseProjectForDelete = useCallback(async (projectName) => {
    const normalized = normalizeProjectResourceName(projectName);
    const openName = openProjectNameRef.current
      ? normalizeProjectResourceName(openProjectNameRef.current)
      : null;

    if (documentRef.current && openName === normalized) {
      await closeCurrentDocument();
      // Let the server release the open session before DeleteProject
      await new Promise((r) => setTimeout(r, 400));
    }

    if (normalizeProjectResourceName(larkProject.audiotoolName) === normalized) {
      setLarkProject(emptyLarkProject());
    }
  }, [closeCurrentDocument, larkProject.audiotoolName]);

  useEffect(() => () => {
    closeCurrentDocument();
  }, [closeCurrentDocument]);

  useEffect(() => () => {
    for (const layer of moodLayers) {
      if (layer?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(layer.url);
      }
    }
  }, [moodLayers]);

  useEffect(() => () => {
    if (instrumentalRender?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(instrumentalRender.url);
    }
  }, [instrumentalRender]);

  useEffect(() => {
    if (!authLoading) {
      setIsProjectBusy(false);
    }
  }, [authLoading]);

  const requireClient = useCallback(() => {
    if (!isAuthenticated || !client) {
      throw new Error('Sign in with Audiotool to manage projects.');
    }
    return client;
  }, [isAuthenticated, client]);

  const refreshProjectList = useCallback(async () => {
    const at = requireClient();
    setProjectError(null);
    const result = await at.projects.listProjects({
      pageSize: 50,
      orderBy: 'project.update_time desc',
    });
    const response = unwrapAudiotoolResult(result, 'List projects');
    setCloudProjects(response.projects ?? []);
    return response.projects ?? [];
  }, [requireClient]);

  const openProjectDocument = useCallback(async (projectName) => {
    const at = requireClient();
    await closeCurrentDocument();
    const resourceName = normalizeProjectResourceName(projectName);
    const doc = await at.open(studioUrlForProject(resourceName) || resourceName);
    await doc.start();
    documentRef.current = doc;
    openProjectNameRef.current = resourceName;
    return doc;
  }, [requireClient, closeCurrentDocument]);

  const isDocumentConnected = useCallback((doc) => {
    const connected = doc?.connected?.value ?? doc?.connected;
    return connected !== false;
  }, []);

  const waitForDocumentConnection = useCallback(async (doc, timeoutMs = 12000) => {
    if (!doc || isDocumentConnected(doc)) return doc;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Lost connection to Audiotool. Wait a moment and try again.'));
      }, timeoutMs);

      const connectedField = doc.connected;
      if (connectedField?.subscribe) {
        const unsubscribe = connectedField.subscribe((isConnected) => {
          if (isConnected) {
            clearTimeout(timeout);
            unsubscribe?.();
            resolve(undefined);
          }
        });
        if (isDocumentConnected(doc)) {
          clearTimeout(timeout);
          unsubscribe?.();
          resolve(undefined);
        }
        return;
      }

      const interval = setInterval(() => {
        if (isDocumentConnected(doc)) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve(undefined);
        }
      }, 200);
    });

    return doc;
  }, [isDocumentConnected]);

  const openProject = useCallback(async (projectName) => {
    if (!isAuthenticated) {
      login();
      return null;
    }

    const at = requireClient();
    setIsProjectBusy(true);
    setProjectError(null);

    try {
      const getResult = await at.projects.getProject({ name: projectName });
      const got = unwrapAudiotoolResult(getResult, 'Get project');
      const project = got.project;
      if (!project?.name) {
        throw new Error('Project not found.');
      }

      const doc = await openProjectDocument(project.name);
      const next = {
        ...audiotoolProjectToLark(project),
        dawUrl: doc.dawUrl,
      };
      setLarkProject(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setIsProjectBusy(false);
    }
  }, [isAuthenticated, login, requireClient, openProjectDocument]);

  const ensureProjectDocument = useCallback(async (projectName) => {
    const resourceName = normalizeProjectResourceName(projectName);
    let doc = documentRef.current;
    const openName = openProjectNameRef.current
      ? normalizeProjectResourceName(openProjectNameRef.current)
      : null;

    if (!doc || openName !== resourceName) {
      await openProject(projectName);
      doc = documentRef.current;
    } else if (!isDocumentConnected(doc)) {
      await openProjectDocument(projectName);
      doc = documentRef.current;
    }

    if (!doc) {
      throw new Error('Could not open the Audiotool project. Select it again from the dropdown.');
    }

    await waitForDocumentConnection(doc);
    return doc;
  }, [
    isDocumentConnected,
    openProject,
    openProjectDocument,
    waitForDocumentConnection,
  ]);

  const createNewProject = useCallback(async (overrides = {}) => {
    if (!isAuthenticated) {
      login();
      return null;
    }

    const at = requireClient();
    setIsProjectBusy(true);
    setProjectError(null);

    try {
      const title = overrides.title ?? larkProject.title ?? 'Untitled Track';
      const instrument = overrides.target_instrument ?? larkProject.target_instrument;
      const mood = overrides.selected_mood ?? larkProject.selected_mood;
      const sourceUrl = overrides.source_audio_url ?? larkProject.source_audio_url;
      const productionBrief = overrides.production_brief ?? larkProject.production_brief;
      const studioLayers = sanitizeStudioLayers(
        overrides.studio_layers ?? larkProject.studio_layers,
        instrument,
      );
      const wowPassLayers = sanitizeWowPassLayers(
        overrides.wow_pass_layers ?? larkProject.wow_pass_layers,
      );
      const gmPresetSlug = normalizeGmPresetSlug(
        instrument,
        overrides.gm_preset_slug ?? larkProject.gm_preset_slug,
      );

      const createResult = await at.projects.createProject({
        project: {
          displayName: title,
          description: encodeLarkMetadata({
            source_audio_url: sourceUrl,
            target_instrument: instrument,
            gm_preset_slug: gmPresetSlug,
            selected_mood: mood,
            production_brief: productionBrief,
            elevenlabs_output_url: overrides.elevenlabs_output_url ?? larkProject.elevenlabs_output_url,
            studio_layers: studioLayers,
            wow_pass_layers: wowPassLayers,
          }),
        },
      });
      const created = unwrapAudiotoolResult(createResult, 'Create project');
      const project = created.project;
      if (!project?.name) {
        throw new Error('Create project did not return a project name.');
      }

      const doc = await openProjectDocument(project.name);
      const next = {
        ...audiotoolProjectToLark(project),
        dawUrl: doc.dawUrl,
      };
      setLarkProject(next);
      await refreshProjectList();
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setIsProjectBusy(false);
    }
  }, [
    isAuthenticated,
    login,
    requireClient,
    larkProject,
    openProjectDocument,
    refreshProjectList,
  ]);

  const saveProject = useCallback(async (overrides = {}) => {
    if (!isAuthenticated) {
      login();
      return null;
    }

    const at = requireClient();
    const name = overrides.audiotoolName ?? larkProject.audiotoolName;

    setIsProjectBusy(true);
    setProjectError(null);

    try {
      const projectName = name;

      if (!projectName) {
        throw new Error('Choose an Audiotool project to use (Connected project).');
      }

      const title = overrides.title ?? larkProject.title ?? 'Untitled Track';
      const instrument = overrides.target_instrument ?? larkProject.target_instrument;
      const mood = overrides.selected_mood ?? larkProject.selected_mood;
      const sourceUrl = overrides.source_audio_url ?? larkProject.source_audio_url;
      const productionBrief = overrides.production_brief ?? larkProject.production_brief;
      const outputUrl = overrides.elevenlabs_output_url ?? larkProject.elevenlabs_output_url;
      const studioLayers = sanitizeStudioLayers(
        overrides.studio_layers ?? larkProject.studio_layers,
        instrument,
      );
      const wowPassLayers = sanitizeWowPassLayers(
        overrides.wow_pass_layers ?? larkProject.wow_pass_layers,
      );
      const gmPresetSlug = normalizeGmPresetSlug(
        instrument,
        overrides.gm_preset_slug ?? larkProject.gm_preset_slug,
      );

      const updateResult = await at.projects.updateProject({
        project: {
          name: projectName,
          displayName: title,
          description: encodeLarkMetadata({
            source_audio_url: sourceUrl,
            target_instrument: instrument,
            gm_preset_slug: gmPresetSlug,
            selected_mood: mood,
            production_brief: productionBrief,
            elevenlabs_output_url: outputUrl,
            studio_layers: studioLayers,
            wow_pass_layers: wowPassLayers,
          }),
        },
        updateMask: { paths: ['display_name', 'description'] },
      });
      const updated = unwrapAudiotoolResult(updateResult, 'Save project');
      const project = updated.project;
      const next = audiotoolProjectToLark(project);
      setLarkProject((prev) => ({
        ...prev,
        ...next,
        source_audio_url: sourceUrl,
        target_instrument: instrument,
        gm_preset_slug: gmPresetSlug,
        selected_mood: mood,
        elevenlabs_output_url: outputUrl,
        studio_layers: studioLayers,
        wow_pass_layers: wowPassLayers,
      }));
      await refreshProjectList();
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setIsProjectBusy(false);
    }
  }, [
    isAuthenticated,
    login,
    requireClient,
    larkProject,
    createNewProject,
    refreshProjectList,
  ]);

  const resetLocalProject = useCallback(async () => {
    await closeCurrentDocument();
    setLarkProject(emptyLarkProject());
    setProjectError(null);
  }, [closeCurrentDocument]);

  const renameProject = useCallback(async (projectName, newTitle) => {
    const at = requireClient();
    const title = newTitle?.trim();
    if (!projectName || !title) return null;

    setIsProjectBusy(true);
    setProjectError(null);

    try {
      const updateResult = await at.projects.updateProject({
        project: { name: projectName, displayName: title },
        updateMask: { paths: ['display_name'] },
      });
      const updated = unwrapAudiotoolResult(updateResult, 'Rename project');
      const project = updated.project;
      const next = audiotoolProjectToLark(project);

      if (larkProject.audiotoolName === projectName) {
        setLarkProject((prev) => ({ ...prev, ...next, title }));
      }

      await refreshProjectList();
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setIsProjectBusy(false);
    }
  }, [requireClient, larkProject.audiotoolName, refreshProjectList]);

  const transformHummingToInstrument = useCallback(async ({
    sourceUrl: sourceUrlOverride,
    sourceBlob: sourceBlobOverride,
    instrument: instrumentOverride,
    gmPresetSlug: gmPresetSlugOverride,
    studioLayers: studioLayersOverride,
    mood: moodOverride,
    audiotoolName: audiotoolNameOverride,
  } = {}) => {
    if (!isAuthenticated) {
      login();
      return null;
    }

    setIsProjectBusy(true);
    setProjectError(null);
    setProjectSuccess(null);

    try {
      const audiotoolName = audiotoolNameOverride ?? larkProject.audiotoolName;
      const instrument = instrumentOverride ?? larkProject.target_instrument;
      const mood = moodOverride ?? larkProject.selected_mood;
      const studioLayers = sanitizeStudioLayers(
        studioLayersOverride ?? larkProject.studio_layers,
        instrument,
      );
      const gmPresetSlug = normalizeGmPresetSlug(
        instrument,
        gmPresetSlugOverride ?? larkProject.gm_preset_slug,
      );
      const sourceUrl = sourceUrlOverride ?? larkProject.source_audio_url;

      if (!sourceUrl) {
        throw new Error('Record or import humming first.');
      }
      if (!instrument) {
        throw new Error('Choose a target instrument first.');
      }
      if (!audiotoolName) {
        throw new Error('Choose an Audiotool project to use (Connected project).');
      }

      const doc = await ensureProjectDocument(audiotoolName);

      const blob = await fetchAudioBlob(sourceUrl, sourceBlobOverride);

      const { transcribeHumToNotes } = await import('@/lib/hum-basic-pitch');
      const transcription = await transcribeHumToNotes(blob, {
        instrument,
        mood,
        onProgress: setTransformStatus,
      });

      const at = requireClient();
      const gmPreset = await fetchGmPreset(at, instrument, gmPresetSlug);

      const nexusResult = await applyNotesWithLayers(doc, {
        instrument,
        layers: studioLayers,
        mood,
        notePlans: transcription.notePlans,
        regionDuration: transcription.regionDuration,
        bpm: transcription.bpm,
        gmPreset,
      });

      await waitForNexusSync(doc, { onProgress: setTransformStatus });

      setLarkProject((prev) => ({
        ...prev,
        target_instrument: instrument,
        gm_preset_slug: gmPresetSlug,
        selected_mood: mood,
        studio_layers: studioLayers,
        dawUrl: doc.dawUrl ?? prev.dawUrl,
      }));

      const melodyLabel = transcription.source === 'basic-pitch'
        ? 'Melody from your hum (Basic Pitch).'
        : 'Rhythm only (Basic Pitch unavailable).';
      const cleanLabel = transcription.cleaned ? ' Hum cleaned for analysis.' : '';
      const layerMsg = nexusResult.layerCount
        ? ` + ${nexusResult.layerCount} Studio layer${nexusResult.layerCount > 1 ? 's' : ''} (${nexusResult.layersWritten.join(', ')})`
        : '';
      const successMsg = `${melodyLabel}${cleanLabel} Wrote ${nexusResult.leadNoteCount} lead notes${layerMsg} at ~${nexusResult.bpm} BPM. Open Studio and press play from bar 1.`;
      setProjectSuccess(successMsg);
      setTransformStatus(null);

      return {
        outputUrl: sourceUrl,
        dawUrl: doc.dawUrl ?? larkProject.dawUrl,
        noteCount: nexusResult.noteCount,
        leadNoteCount: nexusResult.leadNoteCount,
        layerCount: nexusResult.layerCount,
        layersWritten: nexusResult.layersWritten,
        bpm: nexusResult.bpm,
        nexusCabled: nexusResult.cabled ?? false,
        hummingUsed: true,
        transcriptionSource: transcription.source,
        message: successMsg,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setTransformStatus(null);
      setIsProjectBusy(false);
    }
  }, [isAuthenticated, login, larkProject, ensureProjectDocument, requireClient]);

  const renderInstrumental = useCallback(async ({
    sourceUrl: sourceUrlOverride,
    sourceBlob: sourceBlobOverride,
    instrument: instrumentOverride,
    mood: moodOverride,
    gmPresetSlug: gmPresetSlugOverride,
    customPrompt: customPromptOverride,
  } = {}) => {
    const instrument = instrumentOverride ?? larkProject.target_instrument;
    const mood = moodOverride ?? larkProject.selected_mood;
    const sourceUrl = sourceUrlOverride ?? larkProject.source_audio_url;
    const customPrompt = customPromptOverride ?? larkProject.production_brief;
    const gmPresetSlug = normalizeGmPresetSlug(
      instrument,
      gmPresetSlugOverride ?? larkProject.gm_preset_slug,
    );

    if (!sourceUrl) {
      throw new Error('Record or import humming first.');
    }
    if (!instrument) {
      throw new Error('Choose a lead instrument in Studio (middle column).');
    }
    if (!mood) {
      throw new Error('Pick a mood first.');
    }
    if (!customPrompt?.trim()) {
      throw new Error('Write or refresh your production brief first.');
    }

    setIsRenderingInstrumental(true);
    setProjectError(null);
    setProjectSuccess(null);

    try {
      const blob = await fetchAudioBlob(sourceUrl, sourceBlobOverride);
      const result = await renderInstrumentalFromHum({
        sourceUrl,
        sourceBlob: blob,
        instrument,
        mood,
        gmPresetSlug,
        customPrompt,
        onProgress: setRenderStatus,
      });

      setInstrumentalRender((prev) => {
        if (prev?.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url);
        return result;
      });

      setLarkProject((prev) => ({
        ...prev,
        elevenlabs_output_url: result.url,
      }));

      const bpmHint = result.humContext?.bpm
        ? ` (~${Math.round(result.humContext.bpm)} BPM from your hum)`
        : '';
      const engine = result.providerLabel ?? 'ElevenLabs';
      setProjectSuccess(`Rendered with ${engine}${bpmHint}. Press play below.`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setRenderStatus(null);
      setIsRenderingInstrumental(false);
    }
  }, [larkProject]);

  const generateMoodLayers = useCallback(async ({
    sourceUrl: sourceUrlOverride,
    sourceBlob: sourceBlobOverride,
    noteBpm,
    layerTypes: layerTypesOverride,
  } = {}) => {
    if (!isAuthenticated) {
      login();
      return [];
    }

    const instrument = larkProject.target_instrument;
    const mood = larkProject.selected_mood;
    const sourceUrl = sourceUrlOverride ?? larkProject.source_audio_url;
    if (!sourceUrl) {
      throw new Error('Record or import humming first.');
    }
    if (!instrument) {
      throw new Error('Choose a target instrument first.');
    }
    if (!mood) {
      throw new Error(`Choose a mood for ${MOOD_LAYERS_NAME}.`);
    }

    setIsGeneratingMoodLayers(true);
    setProjectError(null);
    setProjectSuccess(null);
    try {
      const blob = await fetchAudioBlob(sourceUrl, sourceBlobOverride);
      const durationMs = await getAudioDurationMs(blob);

      let humContext = { bpm: noteBpm ?? null };
      try {
        const { transcribeHumToNotes } = await import('@/lib/hum-basic-pitch');
        const transcription = await transcribeHumToNotes(blob, { instrument, mood });
        humContext = humToneContextFromTranscription(transcription);
      } catch {
        // Prompt still works without pitch analysis
      }

      const layerTypes = sanitizeWowPassLayers(
        layerTypesOverride ?? larkProject.wow_pass_layers,
      );
      if (!layerTypes.length) {
        throw new Error(`Select at least one ${MOOD_LAYERS_NAME} type to generate.`);
      }

      const layers = await composeMoodLayers({
        instrument,
        mood,
        bpm: humContext.bpm ?? noteBpm,
        durationMs,
        humContext,
        layerTypes,
      });
      setMoodLayers((prev) => {
        for (const old of prev) {
          if (old?.url?.startsWith('blob:')) URL.revokeObjectURL(old.url);
        }
        return layers;
      });
      setProjectSuccess(`Generated ${layers.length} ${MOOD_LAYERS_NAME} with ElevenLabs.`);
      return layers;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setIsGeneratingMoodLayers(false);
    }
  }, [isAuthenticated, login, larkProject]);

  const importWowPassToStudio = useCallback(async ({ noteBpm } = {}) => {
    if (!isAuthenticated) {
      login();
      return null;
    }

    if (!larkProject.audiotoolName) {
      throw new Error('Choose an Audiotool project first (Step 2).');
    }
    if (!moodLayers.length) {
      throw new Error(`Generate ${MOOD_LAYERS_NAME} first.`);
    }

    const at = requireClient();
    setIsImportingWowLayers(true);
    setWowImportStatus(null);
    setProjectError(null);

    try {
      const doc = await ensureProjectDocument(larkProject.audiotoolName);
      const result = await importWowLayersToStudio(at.samples, doc, {
        layers: moodLayers,
        bpm: noteBpm,
        onProgress: setWowImportStatus,
      });
      setProjectSuccess(
        `Imported ${result.count} ${MOOD_LAYERS_NAME} track${result.count > 1 ? 's' : ''} to Studio: ${result.imported.join(', ')}.`,
      );
      setWowImportStatus(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProjectError(message);
      throw err;
    } finally {
      setWowImportStatus(null);
      setIsImportingWowLayers(false);
    }
  }, [
    isAuthenticated,
    login,
    larkProject.audiotoolName,
    moodLayers,
    requireClient,
    ensureProjectDocument,
  ]);

  const deleteCloudProject = useCallback(async (projectName) => {
    const at = requireClient();
    const name = normalizeProjectResourceName(projectName);
    if (!name) {
      throw new Error('Invalid project name.');
    }

    const cloudProject = cloudProjects.find(
      (p) => normalizeProjectResourceName(p?.name) === name,
    );
    const blockReason = getProjectDeleteBlockReason(cloudProject, userName);
    if (blockReason) {
      setProjectError(blockReason);
      throw new Error(blockReason);
    }

    setIsProjectBusy(true);
    setProjectError(null);

    const hadOpenSession = Boolean(
      documentRef.current
      || (openProjectNameRef.current
        && normalizeProjectResourceName(openProjectNameRef.current) === name),
    );

    const attemptDelete = async () => {
      const result = await at.projects.deleteProject({ name });
      return unwrapAudiotoolResult(result, 'Delete project');
    };

    try {
      await releaseProjectForDelete(name);

      try {
        await attemptDelete();
      } catch {
        await releaseProjectForDelete(name);
        await attemptDelete();
      }

      await refreshProjectList();
    } catch (err) {
      const hint = formatDeleteProjectError(err, { blockReason, hadOpenSession });
      setProjectError(hint);
      throw err;
    } finally {
      setIsProjectBusy(false);
    }
  }, [
    requireClient,
    releaseProjectForDelete,
    refreshProjectList,
    cloudProjects,
    userName,
  ]);

  return {
    larkProject,
    setLarkProject,
    patchLarkProject,
    cloudProjects,
    isProjectBusy,
    projectError,
    setProjectError,
    projectSuccess,
    setProjectSuccess,
    transformStatus,
    moodLayers,
    isGeneratingMoodLayers,
    authLoading,
    isAuthenticated,
    login,
    refreshProjectList,
    createNewProject,
    openProject,
    saveProject,
    renameProject,
    resetLocalProject,
    deleteCloudProject,
    transformHummingToInstrument,
    renderInstrumental,
    generateMoodLayers,
    instrumentalRender,
    isRenderingInstrumental,
    renderStatus,
    importWowPassToStudio,
    isImportingWowLayers,
    wowImportStatus,
    activeDocument: documentRef,
  };
}
