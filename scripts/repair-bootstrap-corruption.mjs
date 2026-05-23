/**
 * Fix bootstrap.js corruption from overlapping wave-2 line strips.
 * Sources: src/js/app.bundle.js (last good build), _extract/cloud.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOT = path.join(ROOT, 'src/js/app/bootstrap.js');
const BUNDLE = path.join(ROOT, 'src/js/app.bundle.js');
const CLOUD_EX = path.join(ROOT, 'src/js/app/_extract/cloud.js');

let boot = fs.readFileSync(BOOT, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');

function sliceBetween(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a + startMark.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${startMark}`);
  return src.slice(a, b);
}

// --- 1) Fix ingestFilesFromList tail + handleFiles ---
const ingestTail = `
        if (addToRag) {
          for (let ci = 0; ci < Math.min(text.length, 12000); ci += 1200) {
            addToRAG(f.name, text.slice(ci, ci + 1200), \`file:\${f.name}:c\${Math.floor(ci/1200)}\`);
          }
        }
        continue;
      }
      out.push({
        name: f.name, kind: "binary",
        chars: 0,
        extracted: false,
        text: \`[Binary file attached: \${f.name} (\${Math.round(f.size / 1024)} KB, type \${f.type || "unknown"}) — contents not sent to the model.]\`,
      });
    } catch (err) {
      console.warn("[file] failed:", f.name, err);
    }
  }
  return out;
}

  async function handleFiles(fileList) {
    const imgs = [];
    const docs = [];
    for (const f of fileList) {
      if (f.type.startsWith("image/")) imgs.push(f);
      else docs.push(f);
    }
    if (imgs.length) await handleImages(imgs);
    state.pendingFiles.push(...(await ingestFilesFromList(docs)));
    renderPending(); txtInput.value = "";
  }

`;

boot = boot.replace(
  /        out\.push\(\{\n          name: f\.name,\n          kind: "text",[\s\S]*?function populateCloudModels\(\) \{[\s\S]*?throw new Error\(`Unknown cloud provider: \$\{provider\}`\);\n    \}\n  \}\n\n  let loadModelsSeq/,
  `${ingestTail}
  let loadModelsSeq`,
);

// --- 2) loadModels + setStatus from bundle ---
const loadBlock = sliceBetween(bundle, 'let loadModelsSeq = 0;', 'const LOOK_2026 =');
boot = boot.replace(
  /let loadModelsSeq = 0;[\s\S]*?async function regenerateFromAssistant/,
  `${loadBlock}  async function regenerateFromAssistant`,
);

// --- 3) Remove duplicate runAssistantTurn tail before regenerate (if present) ---
boot = boot.replace(
  /\n    assistant\.completedAt = Date\.now\(\);[\s\S]*?if \(current\) setActiveTitle\(current\.title\);\n  \}\n\n  async function regenerateFromAssistant/,
  '\n\n  async function regenerateFromAssistant',
);

// --- 4) Fix agentToolNames + restore tool builders + runOneTool ---
const agentToolsBlock = sliceBetween(bundle, 'function buildOpenAITools(agent) {', 'async function agentTurnOllama({ model, messages, tools, temperature, signal })');

boot = boot.replace(
  /  function agentToolNames\(agent\) \{[\s\S]*?\/\/ Animated typewriter/,
  `  function agentToolNames(agent) {
    if (!agent || !Array.isArray(agent.tools)) return [];
    const out = new Set();
    for (const t of agent.tools) {
      if (t === "memory") { out.add("remember_fact"); out.add("recall_facts"); }
      else if (t === "datetime") out.add("current_datetime");
      else if (t === "pubmed") out.add("pubmed_search");
      else if (t === "code_interpreter" || t === "python") out.add("execute_python");
      else if (AGENT_TOOLS[t]) out.add(t);
    }
    return [...out];
  }

  ${agentToolsBlock}`,
);

// --- 5) Agent turns init (after runOneTool) ---
if (!boot.includes('Wave 2: agent provider turns')) {
  boot = boot.replace(
    '  async function agentTurnOllama({ model, messages, tools, temperature, signal }) {',
    `  // --- Wave 2: agent provider turns ---
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
    cloudFetch, cloudHttpError, cloudRecord, getProviderKey, fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey,
    parseCloudModel, nvidiaKeyEl, geminiKeyEl, anthropicKeyEl,
    buildOpenAITools, buildGeminiTools, buildOllamaTools, buildOllamaMessages,
    runOneTool, memRecall, memAutoExtract, memAutoExtractFromAssistant, state, modelEl,
  }));

  async function agentTurnOllama_STUB_REMOVED({ model, messages, tools, temperature, signal }) {`,
  );
  // Remove stub and any duplicate agent turn bodies until nvidiaStreamChat
  boot = boot.replace(
    /async function agentTurnOllama_STUB_REMOVED[\s\S]*?\/\/ ========= NVIDIA NIM/,
    '  // ========= NVIDIA NIM',
  );
}

// --- 6) MCP + RAG corruption in renderMcpPanel ---
const mcpCollect = sliceBetween(bundle, 'let _mcpToolServerMap = {};', 'const RAG_MAX_BYTES =');

boot = boot.replace(
  /tools\.forEach\(t => \{[\s\S]*?\/\/ ========= Auto-router =========/,
  `${mcpCollect}
  // ========= Auto-router =========`,
);

fs.writeFileSync(BOOT, boot);
console.log('repaired bootstrap.js →', boot.split('\n').length, 'lines');
