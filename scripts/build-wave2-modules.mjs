/**
 * Wrap _extract/*.js bodies in factory modules under src/js/app/.
 * Run after: node scripts/extract-wave2.mjs && node scripts/build-wave2-modules.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'src/js/app/_extract');
const APP = path.join(ROOT, 'src/js/app');

function read(name) {
  return fs.readFileSync(path.join(EX, `${name}.js`), 'utf8');
}

function write(rel, content) {
  const p = path.join(APP, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log('wrote', rel);
}

// --- cloud-fetch ---
write(
  'providers/cloud-fetch.js',
  `import { nativeHttpRequest, nativeHttpStream } from './http-native.js';
import { parseCloudModel } from '../core/utils.js';

export function createCloudFetchApi(deps) {
  const { $, modelEl, groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl, openaiKeyEl, anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl } = deps;

${read('cloud-fetch')}

  return { cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip };
}
`,
);

// --- cloud-catalog ---
let catalogBody = read('cloud-catalog');
catalogBody = catalogBody.replace(
  /\nasync function initMcpOnBoot\(\) \{[\s\S]*?\n\}\n\n\/\/ Rebuild/,
  '\n// Rebuild',
);
write(
  'providers/cloud-catalog.js',
  `import { parseCloudModel, escapeHtml } from '../core/utils.js';

export function createCloudCatalogApi(deps) {
  const {
    $, modelEl, setActiveSub, SAVED, compareModelEl, compareBar, state,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl, openaiKeyEl,
    anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip, initMcpOnBoot,
    fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey,
  } = deps;

${catalogBody}

  return {
    CLOUD_FALLBACK,
    CLOUD_MODELS,
    prettifyModelId,
    isExcludedCloudModel,
    visibleCloudModels,
    mergeCloudLists,
    fetchGroqModels,
    fetchGeminiModels,
    fetchOpenRouterModels,
    fetchCerebrasModels,
    fetchSambaModels,
    fetchOpenAIModels,
    fetchAnthropicModels,
    fetchMoonshotModels,
    fetchDeepSeekModels,
    fetchMistralModels,
    fetchMinimaxModels,
    fetchGLMModels,
    fetchNvidiaModels,
    loadCloudModelsFor,
    isImageGenModel,
    seedSavedModelDropdown,
    cloudModelLabel,
    getModelTier,
    getAvailableCloudModels,
    getBestFailoverModel,
    ollamaModelName,
    rememberLocalModels,
    trackLocalModel,
    untrackLocalModel,
    getTrackedLocalModels,
    fetchLoadedLocalModels,
    unloadLocalModels,
    updateCloudModelVisualState,
    populateCloudModels,
    initMcpOnBoot,
    refreshCloudProvider,
    refreshCloudModelsFromAPIs,
    syncCompareModelOptions,
    setCompareMode,
    cloudHttpError,
    generateCloudImage,
    toOpenAIVision,
    streamCloudModel,
    parseOpenAISSE,
  };
}
`,
);

// --- agent-turns ---
write(
  'providers/agent-turns.js',
  `import { safeHost } from '../core/utils.js';

export function createAgentTurnsApi(deps) {
  const {
    cloudFetch, cloudHttpError, cloudRecord, getProviderKey,
    fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey,
    parseCloudModel, nvidiaKeyEl, geminiKeyEl, anthropicKeyEl,
    buildOpenAITools, buildGeminiTools, buildOllamaTools, buildOllamaMessages,
    runOneTool, memRecall, memAutoExtract, memAutoExtractFromAssistant,
    state, modelEl,
  } = deps;

${read('agent-turns')}

  return {
    agentTurnOllama,
    agentTurnOpenAI,
    agentTurnOpenAIStream,
    agentTurnOllamaStream,
    agentTurnGeminiStream,
    agentTurnAnthropicStream,
    agentTurnAnthropic,
    agentTurnGemini,
    safeJsonParse,
    extractPythonFence,
    selectAgentAdapter,
    appendAssistantToolCallTurn,
    appendToolResult,
    runAgentLoop,
    runAgentLiteFlow,
    runAgentFallback,
    typewriterIntoBubble,
  };
}
`,
);

// --- rag ---
let ragBody = read('rag');
ragBody = ragBody
  .replace(/\bragEnabled\b/g, 'getRagEnabled()')
  .replace(/function makeSignal\(ms\) \{\s*return window\.MiraXcodeRuntime\.makeSignal\(ms\);\s*\}/, 'const makeSignal = (ms) => window.MiraXcodeRuntime.makeSignal(ms);');

write(
  'features/rag.js',
  `import { safeHost } from '../core/utils.js';

export const RAG_KEY = 'hashgpt_rag';

export function createRagApi(deps) {
  const { getRagEnabled, renderAgentsList } = deps;

${ragBody}

  return {
    loadRAG,
    saveRAG,
    updateRagCount,
    addToRAG,
    queryRAGMerged,
    ragDellStats,
    ragDellClear,
    embedText,
  };
}
`,
);

// --- messages (large; inject bootstrap closures via new Function) ---
const msgExports = [
  'LOOK_2026', 'HASH_AI_PROMPT', 'FULLSTACK_PROMPT', 'PRESET_PROMPTS', 'applyPreset',
  'render', 'renderPending', 'updateContextIndicator', 'deriveTitle', 'cloneMessage',
  'shortTitle', 'setActiveTitle', 'ensureChatIdForCurrentMessages', 'lastUserMessage',
  'normalizeUserMessageText', 'prepareEditBranch', 'runAssistantTurn', 'regenerateFromAssistant',
  'stripReplyPrelude', 'buildReplyWrappedContent', 'clearReplyTo', 'clearEditingMessage',
  'setReplyTo', 'setEditingMessage', 'formatContent', 'updateLastBubble', 'flushPendingBubbleUpdate',
  'setTpsDisplay', 'setSplitTpsDisplay', 'estimateGeneratedTokens',
];
const msgBody = read('messages');
write(
  'ui/messages.js',
  `export function createMessagesApi(deps) {
  const keys = Object.keys(deps);
  const fn = new Function(...keys, ${JSON.stringify(
    msgBody + `\nreturn { ${msgExports.join(', ')} };`,
  )});
  return fn(...keys.map((k) => deps[k]));
}
`,
);

console.log('done — patch bootstrap.js imports + delete extracted line ranges');
