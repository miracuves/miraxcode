import {
  PROVIDER_ICONS,
  BUILTIN_AGENTS,
  PROJECTS_KEY,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT,
  AGENT_RUNS_KEY,
} from './core/constants.js';
import { state } from './core/state.js';
import {
  uid,
  escapeHtml,
  parseCloudModel,
  headersToObject,
  safeHost,
} from './core/utils.js';
import {
  loadChats,
  saveChats,
  saveCodeChats,
  saveForgeChats,
} from './core/persistence-chats.js';
import { nativeHttpRequest, nativeHttpStream } from './providers/http-native.js';
import { createCloudFetchApi } from './providers/cloud-fetch.js';
import { createCloudCatalogApi } from './providers/cloud-catalog.js';
import { createAgentTurnsApi } from './providers/agent-turns.js';
import { createRagApi, RAG_KEY } from './features/rag.js';
import { createRoutingApi } from './features/routing.js';
import { createMcpApi } from './features/mcp.js';
import { createSwarmApi } from './features/swarm.js';
import { createAgentToolsApi } from './features/agent-tools.js';
import { createFileIngestApi } from './features/file-ingest.js';
import { createChatStreamApi } from './features/chat-stream.js';
import { createMessagesApi } from './ui/messages.js';
import { createSettingsApiKeysApi } from './ui/settings-api-keys.js';
import { createSettingsShellApi, createCompactionSelectApi } from './ui/settings-shell.js';
import { createMemoryPaneApi } from './ui/memory-pane.js';
import { createChatSidebarApi } from './ui/chat-sidebar.js';
import { createAgentsPanelApi } from './ui/agents-panel.js';
import { createTabsApi } from './ui/tabs.js';
import { createTemplatesApi } from './ui/templates.js';
import { createComposerExtrasApi } from './ui/composer-extras.js';
import { createMemoryApi } from './core/memory.js';
import { createProjectsApi } from './core/projects.js';
import {
  createMoonshotApi,
  KIMI_ANTHROPIC_BASES,
  isKimiCodeKey,
} from './providers/moonshot.js';
import { createNvidiaStreamApi } from './providers/nvidia-stream.js';
import { createLocalOllamaApi } from './providers/local-ollama.js';
import { createFallbackPanelApi, isFallbackDisabled } from './ui/fallback-panel.js';
import { createDialogsApi } from './ui/dialogs.js';
import {
  readSavedSettings,
  createSaveSettings,
  applySavedToForm,
  hydrateKeychain,
} from './core/settings-runtime.js';
import { createBackendSyncApi } from './core/backend-sync.js';
import {
  buildWindowH,
  initSelectionToolbar,
  initGlobalShortcuts,
  initGlobalCommandPalette,
} from './core/boot-bridge.js';

export async function boot() {
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const toggleSide = $("toggleSide");
  const hostEl = $("host");
  const backendSyncTokenEl = $("backendSyncToken");
  const backendSecretsStatusEl = $("backendSecretsStatus");
  const modelEl = $("model");
  const systemEl = $("system");
  const tempEl = $("temp");
  const tempVal = $("tempVal");
  const msgs = $("messages");
  const input = $("input");
  const sendBtn = $("send");
  const contextWindowEl = $("contextWindow");
  const contextTextEl = $("contextText");
  const contextFillEl = $("contextFill");
  const pending = $("pending");
  const imgInput = $("imgFile");
  const txtInput = $("txtFile");
  const statusDot = $("statusDot");
  const statusText = $("statusText");
  const activeTitle = $("activeTitle");
  const activeSub = $("activeSub");
  const cloudBadgeEl    = $("cloudBadge");
  const ragBlockedBadgeEl = $("ragBlockedBadge");
  // Helper: update model subtitle + cloud/RAG badges together
  // Provider SVG icons — 14×14, minimal, no fills unless noted.
  function setActiveSub(val) {
    const label = _cloudModelLabelFn(val) || "—";
    const isCloud = !!(val && val.startsWith("cloud:"));
    if (isCloud) {
      const { provider } = parseCloudModel(val);
      const icon = PROVIDER_ICONS[provider] || "";
      // Strip " · ProviderName" suffix — the chip conveys that
      const shortName = label.replace(/\s*·\s*[^·]+$/, "") || label;
      activeSub.innerHTML = icon
        ? `<span class="provider-icon-chip provider-chip-${provider}">${icon}</span>${escapeHtml(shortName)}`
        : escapeHtml(label);
    } else {
      activeSub.textContent = label;
    }
    if (cloudBadgeEl)      cloudBadgeEl.style.display      = isCloud ? "inline-flex" : "none";
    // RAG OFF badge: shown whenever a cloud/external model is active —
    // reminds the user that their personal knowledge base is protected.
    if (ragBlockedBadgeEl) ragBlockedBadgeEl.style.display = isCloud ? "inline-flex" : "none";
  }
  const errorSlot = $("errorSlot");
  const chatsListEl  = $("chatsList");
  const agentsListEl = $("agentsList");
  const searchInput  = $("searchInput");
  const searchWrap   = $("searchWrap");
  const memoryRowEl  = $("memoryRow");
  const settingsOverlay = $("settingsOverlay");
  const agentOverlay = $("agentOverlay");
  const tavilyKeyEl = $("tavilyKey");
  const nvidiaKeyEl = $("nvidiaKey");
  const nvidiaModelEl = $("nvidiaModel");   // removed from Settings UI — element will be null; references below are null-safe
  const groqKeyEl = $("groqKey");
  const geminiKeyEl = $("geminiKey");
  const openRouterKeyEl = $("openRouterKey");
  const cerebrasKeyEl   = $("cerebrasKey");
  const sambaKeyEl      = $("sambaKey");
  const openaiKeyEl     = $("openaiKey");
  const anthropicKeyEl  = $("anthropicKey");
  const moonshotKeyEl   = $("moonshotKey");
  const deepseekKeyEl   = $("deepseekKey");
  const mistralKeyEl    = $("mistralKey");
  const minimaxKeyEl    = $("minimaxKey");
  const glmKeyEl        = $("glmKey");
  const autoRouterEl = $("autoRouter");   // removed from Settings UI — element will be null; auto-router is permanently disabled
  const privacyLocalEl     = $("privacyLocal");
  const privacyLocalSideEl = $("privacyLocalSide");
  const sideModelWrap = $("sideModelWrap");
  const trackedLocalModels = new Set();
  // RAG enabled state — boolean, synced to localStorage. DOM elements rendered per-tab.
  let ragEnabled = false;
  let _cloudModelLabelFn = (val) => val || "—";
  var render, runAssistantTurn, regenerateFromAssistant, applyPreset, setActiveTitle;
  var setTab, safeExitMode;
  var ensureChatIdForCurrentMessages, lastUserMessage, normalizeUserMessageText, prepareEditBranch;
  var clearReplyTo, clearEditingMessage, setReplyTo, setEditingMessage, formatContent, cloneMessage;
  var loadRAG, saveRAG, updateRagCount, addToRAG, queryRAGMerged, ragDellStats, ragDellClear;
  var runAgentLoop = async () => { throw new Error("Agent API not initialized"); };
  // injectionEnabled: false = pure messages only; true = RAG + web tools fire.
  // Persisted in localStorage so preference survives refresh.
  let injectionEnabled = false;

  const compareBar = $("compareBar");
  const compareModelEl = $("compareModel");
  const compareClose = $("compareClose");
  const slashPalette = $("slashPalette");
  const templateOverlay = $("templateOverlay");
  const templateListEl = $("templateList");
  const templateNameEl = $("templateName");
  const templateBodyEl = $("templateBody");
  const googleKeyEl = $("googleKey");
  const googleCxEl = $("googleCx");
  const rewriterEl = $("rewriterModel");   // removed from Settings UI — element will be null; rewriter is permanently disabled
  const activeAgentChip = $("activeAgentChip");
  const listLabel = $("listLabel");
  const projectSelect = $("projectSelect");
  const projectNewBtn = $("projectNewBtn");
  const projectNameInput = $("projectNameInput");
  const projectInstructionsInput = $("projectInstructionsInput");
  const projectMemoryMode = $("projectMemoryMode");
  const projectSaveBtn = $("projectSaveBtn");
  const tpsBtn = $("tpsBtn");
  const tpsVal = $("tpsVal");
  const exportBtn = $("exportBtn");
  const exportMenu = $("exportMenu");
  const terminalAlertOverlay = $("terminalAlertOverlay");
  const terminalAlertTitle = $("terminalAlertTitle");
  const terminalAlertBody = $("terminalAlertBody");
  const terminalAlertOk = $("terminalAlertOk");
  const terminalAlertCancel = $("terminalAlertCancel");

  const { themedAlert, themedConfirm, themedPrompt } = createDialogsApi({
    terminalAlertOverlay,
    terminalAlertTitle,
    terminalAlertBody,
    terminalAlertOk,
    terminalAlertCancel,
  });

  function setSidebarCollapsed(collapsed) {
    if (!app) return;
    app.classList.toggle("collapsed", collapsed);
    if (toggleSide) {
      toggleSide.setAttribute("aria-expanded", String(!collapsed));
      toggleSide.setAttribute("aria-pressed", String(collapsed));
      toggleSide.title = collapsed ? "Show sidebar" : "Hide sidebar";
    }
    try { localStorage.setItem("miraxcode_sidebar_collapsed", collapsed ? "1" : "0"); } catch {}
  }

  try {
    setSidebarCollapsed(localStorage.getItem("miraxcode_sidebar_collapsed") === "1");
  } catch {
    setSidebarCollapsed(false);
  }

  toggleSide?.addEventListener("click", (e) => {
    e.preventDefault();
    setSidebarCollapsed(!app?.classList.contains("collapsed"));
  });

  const SAVED = readSavedSettings();

  // ========= Projects / workspace (Wave 5) =========
  const projectsWire = {};
  const {
    loadProjects,
    saveProjects,
    currentProject,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
    chatProjectId,
    chatBelongsToCurrentProject,
    renderProjectSelect,
    projectScopedItems,
    loadAgentRuns,
    saveAgentRuns,
    beginAgentRun,
    recordAgentEvent,
    finishAgentRun,
  } = createProjectsApi({
    uid,
    DEFAULT_PROJECT_ID,
    DEFAULT_PROJECT,
    PROJECTS_KEY,
    AGENT_RUNS_KEY,
    escapeHtml,
    themedPrompt,
    themedAlert,
    themedConfirm,
    saveChats,
    getSavedCurrentProjectId: () => SAVED.currentProjectId,
    projectSelect,
    modelEl,
    inputEl: input,
    wire: projectsWire,
  });

  const {
    memLoad,
    memSave,
    memAdd,
    memRecall,
    memAutoExtract,
    memAutoExtractFromAssistant,
    memClear,
  } = createMemoryApi({ uid, currentProject, DEFAULT_PROJECT_ID });

  let renderMemoryPane = () => {};
  let getHistoryLimit = () => 20;

  if (SAVED.compactionModel && window.HC?.contextCompactor?.setCompactionPreference) {
    HC.contextCompactor.setCompactionPreference(SAVED.compactionModel);
  }

  const KEY_EL_MAP = {
    groqKey: groqKeyEl, geminiKey: geminiKeyEl, openRouterKey: openRouterKeyEl,
    cerebrasKey: cerebrasKeyEl, sambaKey: sambaKeyEl,
    openaiKey: openaiKeyEl, anthropicKey: anthropicKeyEl, moonshotKey: moonshotKeyEl,
    deepseekKey: deepseekKeyEl, mistralKey: mistralKeyEl,
    googleKey: googleKeyEl, googleCx: googleCxEl,
    tavilyKey: tavilyKeyEl, nvidiaKey: nvidiaKeyEl,
    minimaxKey: minimaxKeyEl, glmKey: glmKeyEl,
  };

  const savedForm = applySavedToForm(SAVED, {
    hostEl, systemEl, tempEl, tempVal, nvidiaModelEl, backendSyncTokenEl,
    autoRouterEl, privacyLocalEl, privacyLocalSideEl,
    googleKeyEl, googleCxEl, tavilyKeyEl, nvidiaKeyEl,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl,
    openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl,
    minimaxKeyEl, glmKeyEl,
  });
  ragEnabled = savedForm.ragEnabled;

  let scheduleAllApiKeyAutoTests = () => {};
  let populateCompactionModelSelect = () => {};
  const afterKeyHydrate = () => {
    scheduleAllApiKeyAutoTests(1500);
    populateCompactionModelSelect();
  };
  void hydrateKeychain(KEY_EL_MAP, { onDone: afterKeyHydrate, onFallback: afterKeyHydrate });

  function makeSignal(ms) {
    return window.MiraXcodeRuntime.makeSignal(ms);
  }

  state.activeAgentId = savedForm.activeAgentId || null;
  const _removedAgents = ["builtin_general", "builtin_writer", "builtin_translator"];
  if (_removedAgents.includes(state.activeAgentId)) state.activeAgentId = null;
  updateRangeFill();

  function backendAuthHeaders() {
    const t = (backendSyncTokenEl?.value || "").trim();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  const {
    pullBackendSecrets,
    pushBackendSecretsQuietly,
    getBackendAuthRequired,
    getBackendFetchProxyAvailable,
  } = createBackendSyncApi({
    backendSecretsStatusEl,
    backendSyncTokenEl,
    keyEls: KEY_EL_MAP,
    backendAuthHeaders,
  });

  await pullBackendSecrets();

  let showError = (err) => { try { console.warn('[boot]', err); } catch {} };
  let setStatus = () => {};
  let clearError = () => {};
  let loadModels = async () => {};
  let syncHostPreset = () => {};

  let saveSettings = createSaveSettings({
    hostEl, systemEl, tempEl, modelEl, nvidiaModelEl, backendSyncTokenEl,
    autoRouterEl, privacyLocalEl, getRagEnabled: () => ragEnabled,
    rewriterEl, state, keyEls: KEY_EL_MAP,
    pushBackendSecretsQuietly,
    showError,
    compactionSelectEl: $("compactionModelSelect"),
  });
  ({ populateCompactionModelSelect } = createCompactionSelectApi({ $, saveSettings }));

  // --- Wave 2: cloud providers ---
  const {
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip,
  } = createCloudFetchApi({
    $, modelEl,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl,
    openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
  });

  let API_PROVIDERS = [];
  let renderApisPane = () => {};

  const {
    initMcpOnBoot,
    showMcpPane,
    collectMcpToolDefinitions,
    callMcpTool,
    getMcpToolServerMap,
  } = createMcpApi({ escapeHtml });

  let populateCloudModels = () => {};
  let seedSavedModelDropdown = () => {};
  let streamCloudModel = async () => {};
  let cloudHttpError = (p, s, b, r) => `HTTP ${s}`;
  let parseOpenAISSE = async function* () {};
  let refreshCloudProvider = async () => {};
  let refreshCloudModelsFromAPIs = async () => {};
  let syncCompareModelOptions = () => {};
  let setCompareMode = () => {};
  let isImageGenModel = () => false;
  let getAvailableCloudModels = () => [];
  let getBestFailoverModel = () => null;
  let fetchLoadedLocalModels = async () => ({ names: [] });
  let unloadLocalModels = async () => {};
  let generateCloudImage = async () => {};
  let CLOUD_MODELS = [];

  let cloudModelLabel = (v) => v || "—";
  let visibleCloudModels = (models) => models;

  const {
    orderedMoonshotBases,
    fetchMoonshotApi,
    fetchKimiAnthropic,
  } = createMoonshotApi({
    cloudFetch,
    cloudHttpError: (...args) => cloudHttpError(...args),
  });

  ({
    populateCloudModels, seedSavedModelDropdown, streamCloudModel, cloudHttpError,
    parseOpenAISSE, refreshCloudProvider, refreshCloudModelsFromAPIs, syncCompareModelOptions,
    setCompareMode, isImageGenModel, getAvailableCloudModels, getBestFailoverModel,
    fetchLoadedLocalModels, unloadLocalModels, generateCloudImage, CLOUD_MODELS,
    cloudModelLabel, CLOUD_FALLBACK, ollamaModelName, visibleCloudModels,
    trackLocalModel,
  } = createCloudCatalogApi({
    $, modelEl, setActiveSub, SAVED, compareModelEl, compareBar, state,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl,
    openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip, initMcpOnBoot,
    fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey, isFallbackDisabled,
  }));
  _cloudModelLabelFn = cloudModelLabel;

  const { nvidiaStreamChat } = createNvidiaStreamApi({
    cloudFetch, cloudRecord, nvidiaKeyEl, nvidiaModelEl,
  });

  ({
    loadModels, setStatus, showError, clearError, syncHostPreset, wireHostPresets, wireErrorDismiss,
  } = createLocalOllamaApi({
    $, hostEl, modelEl, statusDot, statusText, errorSlot, escapeHtml,
    makeSignal, saveSettings, populateCloudModels, ollamaModelName, setActiveSub, SAVED,
    rewriterEl, cloudBadgeEl, activeSub, CLOUD_MODELS,
  }));
  wireHostPresets();
  wireErrorDismiss();

  ({
    API_PROVIDERS,
    API_KEY_VALIDATION_KEY,
    API_TEST_PROMPT,
    API_TEST_MODEL_OVERRIDE,
    httpProbeGet,
    validateProviderKey,
    scheduleAllApiKeyAutoTests,
    setApiKeyDotState,
    renderApisPane,
    runApiKeyTest,
  } = createSettingsApiKeysApi({
    $,
    makeSignal,
    showError,
    getProviderKey,
    cloudHttpError,
    CLOUD_FALLBACK,
    isKimiCodeKey,
    orderedMoonshotBases,
    KIMI_ANTHROPIC_BASES,
    populateCompactionModelSelect,
  }));

  try {
    window.mermaid?.initialize?.({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
    });
  } catch {}

  function loadAgents() {
    try {
      const raw = localStorage.getItem("atelier_agents");
      const arr = raw ? JSON.parse(raw) : [];
      state.agents = Array.isArray(arr) ? arr.filter(a => a && typeof a === "object") : [];
    } catch { state.agents = []; }
  }
  function saveAgents() {
    try { localStorage.setItem("atelier_agents", JSON.stringify(state.agents)); } catch {}
  }
  function allAgents() { return [...BUILTIN_AGENTS, ...state.agents]; }
  function getAgent(id) { return allAgents().find(a => a.id === id) || null; }
  function getActiveAgent() { return getAgent(state.activeAgentId); }

  const chatWire = {};
  const {
    isCodeMode,
    isForgeMode,
    activeChatList,
    saveActiveChatList,
    deriveTitle,
    persistCurrentChat,
    newChat,
    loadChat,
    deleteChat,
    renderChatList,
    exportConversation,
    toggleExportMenu,
  } = createChatSidebarApi({
    state,
    uid,
    escapeHtml,
    saveChats,
    saveCodeChats,
    saveForgeChats,
    chatBelongsToCurrentProject,
    chatsListEl,
    searchInput,
    exportBtn,
    exportMenu,
    modelEl,
    input,
    app,
    $,
    themedAlert,
    saveSettings,
    setActiveSub,
    wire: chatWire,
  });

  function chatBucketForTab(tab) {
    if (tab === "code") return "code";
    if (tab === "forge") return "forge";
    return "normal";
  }
  function stashConversationBucket(bucket) {
    if (bucket === "code") {
      state._codeMessages = state.messages.slice();
      state._codeCurrentChatId = state.currentChatId;
    } else if (bucket === "forge") {
      state._forgeMessages = state.messages.slice();
      state._forgeCurrentChatId = state.currentChatId;
    } else {
      state._normalMessages = state.messages.slice();
      state._normalCurrentChatId = state.currentChatId;
    }
  }
  function restoreConversationBucket(bucket) {
    if (bucket === "code") {
      state.messages = state._codeMessages || [];
      state.currentChatId = state._codeCurrentChatId || null;
    } else if (bucket === "forge") {
      state.messages = state._forgeMessages || [];
      state.currentChatId = state._forgeCurrentChatId || null;
    } else {
      state.messages = state._normalMessages || [];
      state.currentChatId = state._normalCurrentChatId || null;
    }
    state.pendingImages = [];
    state.pendingFiles = [];
    state.replyTo = null;
    state.editing = null;
    input.value = "";
    input.style.height = "auto";
    chatWire.renderPending?.();
    const list = bucket === "code" ? state.codeChats : bucket === "forge" ? state.forgeChats : state.chats;
    const chat = list.find(c => c.id === state.currentChatId);
    chatWire.setActiveTitle?.(chat ? chat.title : "New Conversation");
    setActiveSub((chat && chat.model) || modelEl.value);
  }

  let renderAgentsList = () => {};

  const _ragApi = createRagApi({
    getRagEnabled: () => ragEnabled,
    renderAgentsList: () => renderAgentsList(),
  });
  loadRAG = _ragApi.loadRAG;
  saveRAG = _ragApi.saveRAG;
  updateRagCount = _ragApi.updateRagCount;
  addToRAG = _ragApi.addToRAG;
  queryRAGMerged = _ragApi.queryRAGMerged;
  ragDellStats = _ragApi.ragDellStats;
  ragDellClear = _ragApi.ragDellClear;

  let renderPending = () => {};
  const {
    ingestImagesFromList,
    handleImages,
    fileCharLabel,
    fileKindIcon,
    buildAttachedFileContext,
    ingestFilesFromList,
    handleFiles,
  } = createFileIngestApi({
    state,
    addToRAG,
    renderPending: () => renderPending(),
    txtInput,
    imgInput,
  });

  const _routingApi = createRoutingApi({
    tavilyKeyEl,
    googleKeyEl,
    googleCxEl,
    rewriterEl,
    privacyLocalEl,
    nvidiaKeyEl,
    autoRouterEl,
    backendSyncTokenEl,
    makeSignal,
    backendAuthHeaders,
    getBackendAuthRequired,
    getBackendFetchProxyAvailable,
    addToRAG,
  });
  const {
    ROUTE_DEFS,
    currentRoute,
    clearRouteOverride,
    tavilySearch,
    googleSearch,
    wikipediaSearch,
    pubmedSearch,
    rewriteForSearch,
    fetchUrl,
    extractUrls,
    runAgentTools,
  } = _routingApi;

  const {
    agentToolNames,
    buildOpenAITools,
    buildGeminiTools,
    buildOllamaTools,
    runOneTool,
    AGENT_MAX_ITERATIONS,
  } = createAgentToolsApi({
    tavilySearch,
    googleSearch,
    wikipediaSearch,
    pubmedSearch,
    fetchUrl,
    addToRAG,
    memAdd,
    memRecall,
    collectMcpToolDefinitions,
    getMcpToolServerMap,
    callMcpTool,
  });

  let streamChat = async () => {};
  let buildOllamaMessages = () => [];
  let updateLastBubble = () => {};
  let flushPendingBubbleUpdate = () => {};
  let updateContextIndicator = () => {};
  let send = async () => {};
  let abort = () => { state.abort?.abort(); };
  let streamWithModelValue = async () => {};
  let buildReplyWrappedContent = (t) => t;
  let diffBlockHtml = () => '';
  let FORGE_ARCHITECT_PROMPT = '';
  let setTpsDisplay = () => {};
  let setSplitTpsDisplay = () => {};
  let estimateGeneratedTokens = () => 0;

  document.querySelector(".tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn || !btn.closest(".tabs")) return;
    e.preventDefault();
    setTab(btn.dataset.tab);
  });
  $("hcSafeExitModeBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    safeExitMode();
  });
  projectSelect?.addEventListener("change", () => {
    switchProject(projectSelect.value);
  });
  projectNewBtn?.addEventListener("click", createProject);
  $("projectRenameBtn")?.addEventListener("click", renameProject);
  $("projectDeleteBtn")?.addEventListener("click", deleteProject);
  // ========= UI wiring =========
  function updateRangeFill() {
    const pct = ((+tempEl.value - +tempEl.min) / (+tempEl.max - +tempEl.min)) * 100;
    tempEl.style.setProperty("--val", pct + "%");
  }
  tempEl.addEventListener("input", () => { tempVal.textContent = tempEl.value; updateRangeFill(); saveSettings(); });
  systemEl.addEventListener("change", saveSettings);
  backendSyncTokenEl?.addEventListener("change", () => { saveSettings(); void pullBackendSecrets(); });

  // ========= Terminate session — unload models from local RAM =========
  const terminateBtn = $("terminateSession");
  terminateBtn.addEventListener("click", async () => {
    if (terminateBtn.classList.contains("busy")) return;
    terminateBtn.classList.add("busy");
    const originalLabel = terminateBtn.querySelector("svg").nextSibling;
    // Abort any live stream
    if (state.streaming) { try { state.abort?.abort(); } catch {} state.streaming = false; sendBtn.textContent = "Send"; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    // Persist current chat BEFORE touching anything so it's preserved
    try { persistCurrentChat(); } catch {}
    const host = safeHost();
    let unloaded = 0;
    try {
      let names = [];
      try {
        const snap = await fetchLoadedLocalModels(host, 5000);
        names = snap.names;
      } catch {
        names = getTrackedLocalModels();
      }
      const unloadSet = [...new Set(names)];
      unloaded = unloadSet.length;
      await unloadLocalModels(unloadSet);
      setStatus("ok", unloaded > 0 ? `Unloaded ${unloaded} model${unloaded===1?"":"s"} · RAM freed` : `RAM freed`);
    } catch (err) {
      showError(new Error(`Couldn't unload models: ${err.message}`));
    } finally {
      terminateBtn.classList.remove("busy");
    }
  });

  const { openSettings } = createSettingsShellApi({
    $,
    settingsOverlay,
    saveSettings,
    HC: window.HC,
    getProviderKey,
    getAPI_PROVIDERS: () => API_PROVIDERS,
    updateCloudUsageChip,
    renderApisPane,
    showMcpPane,
    renderMemoryPane: () => renderMemoryPane(),
    terminalAlertOverlay,
    modelEl,
  });

  const {
    openTemplates,
    fillTemplate,
    activeTemplate,
    insertAtComposer: insertTemplateAtComposer,
    wireTemplateEvents,
  } = createTemplatesApi({
    state,
    uid,
    escapeHtml,
    $,
    themedPrompt,
    templateOverlay,
    templateListEl,
    templateNameEl,
    templateBodyEl,
  });
  wireTemplateEvents(input);

  // Scroll pinning
  let pinned = true;
  msgs.addEventListener("scroll", () => {
    const dist = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
    pinned = dist < 80;
  });

  $("refresh").addEventListener("click", loadModels);
  $("attachImg").addEventListener("click", () => imgInput.click());
  $("attachFile").addEventListener("click", () => txtInput.click());
  imgInput.addEventListener("change", (e) => handleImages(e.target.files));
  txtInput.addEventListener("change", (e) => handleFiles(e.target.files));

  // Drag-drop + paste (main Chats only — Coder composer handles its own drops)
  window.addEventListener("dragover", (e) => {
    if (e.target.closest("#coder-mode-wrap")) return;
    e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (e.target.closest("#coder-mode-wrap")) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imgs = files.filter(f => f.type.startsWith("image/"));
    const docs = files.filter(f => !f.type.startsWith("image/"));
    if (imgs.length) handleImages(imgs);
    if (docs.length) handleFiles(docs);
  });
  window.addEventListener("paste", (e) => {
    if (e.target.closest("#coder-mode-wrap")) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imgs = items.filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean);
    if (imgs.length) handleImages(imgs);
  });

  // --- Wave 2: agent provider turns (after agent-tools + streamChat) ---
  let agentTurnOllama, agentTurnOpenAI, agentTurnOpenAIStream, agentTurnOllamaStream;
  let agentTurnGeminiStream, agentTurnAnthropicStream, agentTurnAnthropic, agentTurnGemini;
  let safeJsonParse, extractPythonFence, selectAgentAdapter;
  let appendAssistantToolCallTurn, appendToolResult;
  let runAgentLiteFlow, runAgentFallback, typewriterIntoBubble;

  ({
    agentTurnOllama, agentTurnOpenAI, agentTurnOpenAIStream, agentTurnOllamaStream,
    agentTurnGeminiStream, agentTurnAnthropicStream, agentTurnAnthropic, agentTurnGemini,
    safeJsonParse, extractPythonFence, selectAgentAdapter,
    appendAssistantToolCallTurn, appendToolResult, runAgentLoop, runAgentLiteFlow, runAgentFallback, typewriterIntoBubble,
  } = createAgentTurnsApi({
    cloudFetch, cloudHttpError, cloudRecord, getProviderKey, fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey,
    parseCloudModel, nvidiaKeyEl, geminiKeyEl, anthropicKeyEl,
    buildOpenAITools, buildGeminiTools, buildOllamaTools,
    buildOllamaMessages: (...args) => buildOllamaMessages(...args),
    runOneTool, memRecall, memAutoExtract, memAutoExtractFromAssistant, state, modelEl,
    AGENT_MAX_ITERATIONS,
  }));

  // --- Wave 2: messages / rendering ---
  ({
    render, runAssistantTurn, regenerateFromAssistant, applyPreset, setActiveTitle,
    ensureChatIdForCurrentMessages, lastUserMessage, normalizeUserMessageText, prepareEditBranch,
    clearReplyTo, clearEditingMessage, setReplyTo, setEditingMessage, formatContent, cloneMessage,
    renderPending,
    buildReplyWrappedContent: _buildReplyWrappedContent,
    stripReplyPrelude: _stripReplyPrelude,
    diffBlockHtml: _diffBlockHtml,
    FORGE_ARCHITECT_PROMPT: _FORGE_ARCHITECT_PROMPT,
    setTpsDisplay: _setTpsDisplay,
    setSplitTpsDisplay: _setSplitTpsDisplay,
    estimateGeneratedTokens: _estimateGeneratedTokens,
  } = createMessagesApi({
    $, state, escapeHtml, safeHost, uid, parseCloudModel,
    msgs, input, sendBtn, modelEl, tempEl, activeTitle, activeSub, pending, pinned,
    tpsBtn, tpsVal, replyBanner, editBanner,
    setStatus, showError, clearError, saveSettings, saveActiveChatList, persistCurrentChat,
    activeChatList, isCodeMode, isForgeMode, deriveTitle, getActiveAgent, injectionEnabled,
    cloudModelLabel, populateCloudModels, fetchLoadedLocalModels, unloadLocalModels,
    streamChat: (...args) => streamChat(...args),
    runAgentLoop, queryRAGMerged, addToRAG, memAutoExtractFromAssistant,
    beginAgentRun, finishAgentRun, recordAgentEvent, agentToolNames,
    currentRoute, clearRouteOverride, ROUTE_DEFS, tavilySearch, googleSearch, wikipediaSearch, pubmedSearch,
    buildAttachedFileContext,
    buildOllamaMessages: (...args) => buildOllamaMessages(...args),
    themedAlert, themedConfirm, HC, HC_CODE: window.HC_CODE,
    updateLastBubble: (...args) => updateLastBubble(...args),
    flushPendingBubbleUpdate: (...args) => flushPendingBubbleUpdate(...args),
    setTpsDisplay: (...args) => setTpsDisplay(...args),
    setSplitTpsDisplay: (...args) => setSplitTpsDisplay(...args),
    renderPending, updateContextIndicator: (...args) => updateContextIndicator(...args),
    fileKindIcon, fileCharLabel,
    renderChatList, setTab, newChat, exportConversation,
    estimateGeneratedTokens: (...args) => estimateGeneratedTokens(...args),
  }));
  buildReplyWrappedContent = _buildReplyWrappedContent;
  diffBlockHtml = _diffBlockHtml;
  FORGE_ARCHITECT_PROMPT = _FORGE_ARCHITECT_PROMPT;
  setTpsDisplay = _setTpsDisplay;
  setSplitTpsDisplay = _setSplitTpsDisplay;
  estimateGeneratedTokens = _estimateGeneratedTokens;

  ({
    send,
    sendCompare,
    abort: abortFn,
    streamChat: streamChatFn,
    streamWithModelValue: streamWithModelValueFn,
    buildOllamaMessages: buildOllamaMessagesFn,
    updateContextIndicator: updateContextIndicatorFn,
    estimatePromptTokens,
    currentPendingModelContent,
    compactNumber,
    writeLastBubbleText,
    showImageGenLoading,
    flushPendingBubbleUpdate: flushPendingBubbleUpdateFn,
    updateLastBubble: updateLastBubbleFn,
    updateComparePane,
  } = createChatStreamApi({
    state,
    escapeHtml,
    safeHost,
    parseCloudModel,
    uid,
    msgs,
    input,
    sendBtn,
    modelEl,
    compareModelEl,
    tempEl,
    systemEl,
    contextWindowEl,
    contextTextEl,
    contextFillEl,
    pinned,
    tpsBtn,
    tpsVal,
    privacyLocalEl,
    nvidiaKeyEl,
    nvidiaModelEl,
    showError,
    clearError,
    themedAlert,
    themedConfirm,
    buildAttachedFileContext,
    buildReplyWrappedContent,
    ensureChatIdForCurrentMessages,
    lastUserMessage,
    normalizeUserMessageText,
    prepareEditBranch,
    clearReplyTo,
    clearEditingMessage,
    runAssistantTurn,
    render,
    renderPending,
    persistCurrentChat,
    cloudModelLabel,
    streamCloudModel,
    generateCloudImage,
    isImageGenModel,
    getBestFailoverModel,
    nvidiaStreamChat,
    trackLocalModel,
    ROUTE_DEFS,
    getActiveAgent,
    currentProject,
    isForgeMode,
    FORGE_ARCHITECT_PROMPT,
    getHistoryLimit: () => getHistoryLimit(),
    estimateGeneratedTokens,
    setTpsDisplay,
    setSplitTpsDisplay,
    diffBlockHtml,
  }));
  abort = abortFn;
  streamChat = streamChatFn;
  streamWithModelValue = streamWithModelValueFn;
  buildOllamaMessages = buildOllamaMessagesFn;
  updateContextIndicator = updateContextIndicatorFn;
  flushPendingBubbleUpdate = flushPendingBubbleUpdateFn;
  updateLastBubble = updateLastBubbleFn;

  ({ setTab, safeExitMode, registerMode } = createTabsApi({
    state,
    $,
    escapeHtml,
    showError,
    persistCurrentChat,
    stashConversationBucket,
    restoreConversationBucket,
    render,
    renderChatList,
    renderAgentsList,
    setCompareMode,
    chatsListEl,
    agentsListEl,
    searchWrap,
    memoryRowEl,
    listLabel,
    activeAgentChip,
  }));

  ({
    renderAgentsList,
    renderActiveAgentChip,
    setActiveAgent,
    openAgentEditor,
    wireAgentEditorEvents,
  } = createAgentsPanelApi({
    $,
    state,
    agentsListEl,
    activeAgentChip,
    agentOverlay,
    escapeHtml,
    uid,
    themedAlert,
    themedConfirm,
    saveAgents,
    saveSettings,
    setTab,
    allAgents,
    loadRAG,
    updateRagCount,
    ragDellStats,
    ragDellClear,
    getRagEnabled: () => ragEnabled,
    setRagEnabled: (v) => { ragEnabled = v; },
  }));
  wireAgentEditorEvents();

  Object.assign(chatWire, {
    setActiveTitle,
    renderPending,
    render,
    renderActiveAgentChip,
    abort,
  });

  Object.assign(projectsWire, {
    persistCurrentChat,
    renderPending,
    setActiveTitle,
    setActiveSub,
    saveSettings,
    renderChatList,
    render,
  });

  ({
    renderMemoryPane,
    getHistoryLimit: getHistoryLimitFn,
  } = createMemoryPaneApi({
    $,
    state,
    DEFAULT_PROJECT_ID,
    escapeHtml,
    memLoad,
    memSave,
    memAdd,
    memClear,
    currentProject,
    themedPrompt,
    themedConfirm,
    themedAlert,
    updateContextIndicator,
  }));
  getHistoryLimit = getHistoryLimitFn;

  createComposerExtrasApi({
    state,
    $,
    escapeHtml,
    input,
    sendBtn,
    slashPalette,
    previewModal: $("previewModal"),
    previewBody: $("previewBody"),
    previewMeta: $("previewMeta"),
    modelEl,
    tempEl,
    tempVal,
    privacyLocalEl,
    rewriterEl,
    themedAlert,
    getActiveAgent,
    currentRoute,
    ROUTE_DEFS,
    tavilySearch,
    googleSearch,
    rewriteForSearch,
    runAgentTools,
    queryRAGMerged,
    buildOllamaMessages,
    currentPendingModelContent,
    getHistoryLimit,
    cloudModelLabel,
    openSettings,
    systemEl,
    openTemplates,
    fillTemplate,
    activeTemplate,
    insertAtComposer: (text, replace) => insertTemplateAtComposer(text, replace, input),
    setTab,
    newChat,
    exportConversation,
    updateRangeFill,
    saveSettings,
    toggleInjection: () => {
      injectionEnabled = !injectionEnabled;
      updateContextIndicator();
    },
    send,
    abort,
    updateContextIndicator,
    editPreviewEl: $("editPreview"),
  }).wireComposerExtras();

  // Keep both privacy toggles (settings panel + sidebar shortcut) in sync.
  function applyPrivacyLocal(checked) {
    privacyLocalEl.checked     = checked;
    privacyLocalSideEl.checked = checked;
    saveSettings();
    updateCloudModelVisualState();
  }
  privacyLocalEl.addEventListener("change",     () => applyPrivacyLocal(privacyLocalEl.checked));
  privacyLocalSideEl.addEventListener("change", () => applyPrivacyLocal(privacyLocalSideEl.checked));
  tavilyKeyEl.addEventListener("change", saveSettings);
  nvidiaModelEl?.addEventListener("change", saveSettings);
  groqKeyEl.addEventListener("change", () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("groq"); });
  geminiKeyEl.addEventListener("change", () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("gemini"); });
  openRouterKeyEl.addEventListener("change", () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("openrouter"); });
  cerebrasKeyEl.addEventListener("change",   () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("cerebras"); });
  sambaKeyEl.addEventListener("change",      () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("samba"); });
  openaiKeyEl.addEventListener("change",     () => { saveSettings(); populateCloudModels(); void refreshCloudProvider("openai"); });
  anthropicKeyEl.addEventListener("change",  () => { saveSettings(); populateCloudModels(); void refreshCloudProvider("anthropic"); });
  moonshotKeyEl.addEventListener("change",   () => { saveSettings(); populateCloudModels(); void refreshCloudProvider("moonshot"); });
  deepseekKeyEl.addEventListener("change",   () => { saveSettings(); populateCloudModels(); void refreshCloudProvider("deepseek"); });
  mistralKeyEl.addEventListener("change",    () => { saveSettings(); populateCloudModels(); void refreshCloudProvider("mistral"); });
  minimaxKeyEl.addEventListener("change",    () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("minimax"); });
  glmKeyEl.addEventListener("change",        () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("glm"); });
  nvidiaKeyEl.addEventListener("change",      () => { saveSettings(); populateCloudModels(); populateCompactionModelSelect(); void refreshCloudProvider("nvidia"); });

  const { wireFallbackPanel } = createFallbackPanelApi({
    escapeHtml,
    CLOUD_MODELS,
    visibleCloudModels,
    populateCloudModels,
  });
  wireFallbackPanel();

  // ========= Boot =========
  loadProjects();
  loadAgentRuns();
  loadChats();
  loadAgents();
  renderProjectSelect();
  renderChatList();
  renderAgentsList();
  renderActiveAgentChip();
  setTab("chats");
  render();
  seedSavedModelDropdown();

  window.MiraXcodeRuntime.unloadTrackedModelsOnExit = () => {
    unloadLocalModels(getTrackedLocalModels(), { keepalive: true });
  };
  loadModels();

  const { ollamaChat, runSwarm } = createSwarmApi({
    streamWithModelValue,
    escapeHtml,
    state,
    render,
    persistCurrentChat,
    getCurrentModel: () => modelEl?.value || "llama3.2",
  });

  initSelectionToolbar({ input, send, isCodeMode });
  initGlobalShortcuts({ state, setTab, newChat, modelEl, isCodeMode });

  buildWindowH({
    get state() { return state; },
    memLoad,
    memAdd,
    memRecall,
    memAutoExtract,
    memAutoExtractFromAssistant,
    runOneTool,
    appendAssistantToolCallTurn,
    appendToolResult,
    extractPythonFence,
    persistCurrentChat,
    setTab,
    safeExitMode,
    render,
    ollamaChat,
    backendAuthHeaders,
    selectedModel: () => modelEl.value,
    selectedTemperature: () => (v => Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0.3)(parseFloat(tempEl.value)),
    agentTurnOpenAI,
    agentTurnOpenAIStream,
    agentTurnGemini,
    agentTurnGeminiStream,
    agentTurnAnthropic,
    agentTurnAnthropicStream,
    agentTurnOllama,
    agentTurnOllamaStream,
    selectAgentAdapter,
    queryRAGMerged,
    addToRAG,
    ragEnabled: () => ragEnabled,
    ingestProjectForRAG: async (root, opts) =>
      window.CdrProjectRag?.ingestProject?.(root, opts) ?? { ingested: 0, skipped: 'unavailable' },
    buildOpenAITools,
    buildGeminiTools,
    buildOllamaTools,
    buildOllamaMessages,
    safeJsonParse,
    updateLastBubble,
    flushPendingBubbleUpdate,
    isCodeMode,
    parseCloudModel,
    ingestImagesFromList,
    ingestFilesFromList,
    buildAttachedFileContext,
    fileKindIcon,
    fileCharLabel,
    getProviderKey,
    estimatePromptTokens,
    updateCloudUsageChip,
    getAvailableCloudModels,
    contextCompactor: () => window.HC?.contextCompactor,
    showError,
    escapeHtml,
    runSwarm,
    registerMode,
  });

  initGlobalCommandPalette({ newChat, exportConversation, setTab, applyPreset });

  setTimeout(() => scheduleAllApiKeyAutoTests(2200), 0);

}
