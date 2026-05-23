/**
 * Wire wave-2 modules into bootstrap.js (imports, init blocks, setActiveSub shim).
 * Run: node scripts/patch-bootstrap-wave2.mjs && node scripts/strip-bootstrap-wave2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOT = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'src/js/app/bootstrap.js',
);

let src = fs.readFileSync(BOOT, 'utf8');

if (!src.includes('createCloudFetchApi')) {
  src = src.replace(
    `} from './core/persistence-chats.js';\n\nexport async function boot()`,
    `} from './core/persistence-chats.js';
import { nativeHttpRequest, nativeHttpStream } from './providers/http-native.js';
import { createCloudFetchApi } from './providers/cloud-fetch.js';
import { createCloudCatalogApi } from './providers/cloud-catalog.js';
import { createAgentTurnsApi } from './providers/agent-turns.js';
import { createRagApi, RAG_KEY } from './features/rag.js';
import { createMessagesApi } from './ui/messages.js';

export async function boot()`,
  );
}

if (!src.includes('_cloudModelLabelFn')) {
  src = src.replace(
    'const label = cloudModelLabel(val) || "—";',
    'const label = _cloudModelLabelFn(val) || "—";',
  );
  src = src.replace(
    'let ragEnabled = false;',
    `let ragEnabled = false;
  let _cloudModelLabelFn = (val) => val || "—";`,
  );
}

const cloudInit = `
  // --- Wave 2: cloud providers ---
  const {
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip,
  } = createCloudFetchApi({
    $, modelEl,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl,
    openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
  });

  let populateCloudModels = () => {};
  let seedSavedModelDropdown = () => {};
  let streamCloudModel = async () => {};
  let cloudHttpError = (p, s, b, r) => \`HTTP \${s}\`;
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

  async function initMcpOnBoot() {
    try {
      await scanMcpServers();
      const prefs = loadMcpPrefs();
      const enabledServers = (_mcpServersCache || []).filter(s => prefs[s.name] !== false && s.url);
      for (const srv of enabledServers) {
        await discoverMcpTools(srv.name, srv.url);
      }
      collectMcpToolDefinitions();
    } catch (e) {
      console.warn("[MCP] boot init failed:", e);
    }
  }

  ({
    populateCloudModels, seedSavedModelDropdown, streamCloudModel, cloudHttpError,
    parseOpenAISSE, refreshCloudProvider, refreshCloudModelsFromAPIs, syncCompareModelOptions,
    setCompareMode, isImageGenModel, getAvailableCloudModels, getBestFailoverModel,
    fetchLoadedLocalModels, unloadLocalModels, generateCloudImage, CLOUD_MODELS,
    cloudModelLabel,
  } = createCloudCatalogApi({
    $, modelEl, setActiveSub, SAVED, compareModelEl, compareBar, state,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl,
    openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip, initMcpOnBoot,
  }));
  _cloudModelLabelFn = cloudModelLabel;
`;

if (!src.includes('Wave 2: cloud providers')) {
  src = src.replace(
    '  try {\n    window.mermaid?.initialize?.({',
    `${cloudInit}\n  try {\n    window.mermaid?.initialize?.({`,
  );
}

const agentMarker = '  // -------------------------------------------------------------------------\n  // Provider adapters';
const agentInit = `
  // --- Wave 2: agent provider turns ---
  let agentTurnOllama, agentTurnOpenAI, agentTurnOpenAIStream, agentTurnOllamaStream;
  let agentTurnGeminiStream, agentTurnAnthropicStream, agentTurnAnthropic, agentTurnGemini;
  let safeJsonParse, extractPythonFence, selectAgentAdapter;
  let appendAssistantToolCallTurn, appendToolResult, runAgentLoop, runAgentLiteFlow, runAgentFallback, typewriterIntoBubble;

  ({
    agentTurnOllama, agentTurnOpenAI, agentTurnOpenAIStream, agentTurnOllamaStream,
    agentTurnGeminiStream, agentTurnAnthropicStream, agentTurnAnthropic, agentTurnGemini,
    safeJsonParse, extractPythonFence, selectAgentAdapter,
    appendAssistantToolCallTurn, appendToolResult, runAgentLoop, runAgentLiteFlow, runAgentFallback, typewriterIntoBubble,
  } = createAgentTurnsApi({
    cloudFetch, cloudHttpError, cloudRecord, getProviderKey, parseCloudModel,
    nvidiaKeyEl, geminiKeyEl, anthropicKeyEl,
    buildOpenAITools, buildGeminiTools, buildOllamaTools, buildOllamaMessages,
    runOneTool, memRecall, memAutoExtract, memAutoExtractFromAssistant, state, modelEl,
  }));

`;

if (!src.includes('Wave 2: agent provider turns')) {
  src = src.replace(agentMarker, `${agentInit}${agentMarker}`);
}

const ragMarker = '  // ========= Boot =========';
const ragInit = `
  // --- Wave 2: RAG ---
  let loadRAG, saveRAG, updateRagCount, addToRAG, queryRAGMerged, ragDellStats, ragDellClear;
  ({
    loadRAG, saveRAG, updateRagCount, addToRAG, queryRAGMerged, ragDellStats, ragDellClear,
  } = createRagApi({
    getRagEnabled: () => ragEnabled,
    renderAgentsList,
  }));

`;

if (!src.includes('Wave 2: RAG')) {
  src = src.replace(ragMarker, `${ragInit}${ragMarker}`);
}

if (!src.includes('var render, runAssistantTurn')) {
  src = src.replace(
    'let _cloudModelLabelFn = (val) => val || "—";',
    `let _cloudModelLabelFn = (val) => val || "—";
  var render, runAssistantTurn, regenerateFromAssistant, applyPreset, setActiveTitle;
  var ensureChatIdForCurrentMessages, lastUserMessage, normalizeUserMessageText, prepareEditBranch;
  var clearReplyTo, clearEditingMessage, setReplyTo, setEditingMessage, formatContent, cloneMessage;`,
  );
}

const messagesInit = `
  // --- Wave 2: messages / rendering ---
  ({
    render, runAssistantTurn, regenerateFromAssistant, applyPreset, setActiveTitle,
    ensureChatIdForCurrentMessages, lastUserMessage, normalizeUserMessageText, prepareEditBranch,
    clearReplyTo, clearEditingMessage, setReplyTo, setEditingMessage, formatContent, cloneMessage,
  } = createMessagesApi({
    $, state, escapeHtml, safeHost, uid, parseCloudModel,
    msgs, input, sendBtn, modelEl, tempEl, activeTitle, activeSub, pending, pinned,
    tpsBtn, tpsVal, replyBanner, editBanner,
    setStatus, showError, clearError, saveSettings, saveActiveChatList, persistCurrentChat,
    activeChatList, isCodeMode, isForgeMode, deriveTitle, getActiveAgent, injectionEnabled,
    cloudModelLabel, populateCloudModels, fetchLoadedLocalModels, unloadLocalModels,
    streamChat, runAgentLoop, queryRAGMerged, addToRAG, memAutoExtractFromAssistant,
    beginAgentRun, finishAgentRun, recordAgentEvent, agentToolNames,
    currentRoute, routeOverride, ROUTE_DEFS, tavilySearch, googleSearch, wikipediaSearch, pubmedSearch,
    buildAttachedFileContext, buildOllamaMessages, buildReplyWrappedContent, stripReplyPrelude,
    themedAlert, themedConfirm, HC, HC_CODE: window.HC_CODE,
    updateLastBubble, flushPendingBubbleUpdate, setTpsDisplay, setSplitTpsDisplay,
    renderPending, updateContextIndicator, fileKindIcon, fileCharLabel,
    renderChatList, setTab, newChat, exportConversation, estimateGeneratedTokens,
  }));

`;

if (!src.includes('Wave 2: messages / rendering')) {
  const anchor = '  // RAF-throttled bubble updater.';
  if (!src.includes(anchor)) {
    console.error('patch-bootstrap-wave2: RAF anchor missing');
    process.exit(1);
  }
  src = src.replace(anchor, `${messagesInit}${anchor}`);
}

fs.writeFileSync(BOOT, src);
console.log('patched bootstrap.js');
