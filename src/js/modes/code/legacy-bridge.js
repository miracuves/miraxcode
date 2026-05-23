import { callWithRouter } from './router.js';

/** Legacy HC_CODE.run bridge (hashcoder.js) — staged writes match Coder agent-run. */
export function createLegacyBridge(sharedState) {
  function buildMessages() {
    const H = window._H;
    const msgs = (H.buildOllamaMessages && H.buildOllamaMessages()) || [];
    const projectCtx = sharedState.projectRoot ? `\nProject root: ${sharedState.projectRoot}` : '';
    const sysMsgIdx = msgs.findIndex(m => m.role === 'system');
    const fullSys = (HC?.code?.SYSTEM_PROMPT || '') + projectCtx;
    if (sysMsgIdx >= 0) msgs[sysMsgIdx].content = fullSys + '\n\n' + msgs[sysMsgIdx].content;
    else msgs.unshift({ role: 'system', content: fullSys });
    return msgs;
  }

  function buildLegacyTools() {
    return (HC?.code?.TOOL_DEFINITIONS || []).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, v]) =>
              [k, (v && typeof v === 'object' && v.type) ? v : { type: 'string', description: String(v) }]
            )
          ),
          required: Object.keys(t.parameters).filter(k => !['reason', 'cwd', 'file_ext'].includes(k)),
        }
      }
    }));
  }

  function queueStagedEntry(entry) {
    if (!entry) return;
    sharedState.pendingStaged = sharedState.pendingStaged || [];
    const dup = sharedState.pendingStaged.some(
      (e) => e.path === entry.path && e.status === 'pending'
    );
    if (!dup) sharedState.pendingStaged.push(entry);
    if (document.body.classList.contains('coder-mode') && window.CoderMode?.ingestStagedEntry) {
      window.CoderMode.ingestStagedEntry(entry);
    } else {
      HC?.guard?.notify?.(
        `Staged ${entry.name || entry.path} — open Coder tab to Accept/Reject`,
        'info'
      );
    }
  }

  async function runStagedTool(call) {
    const yolo = HC?.guard?.isYolo?.();
    const { entry, resultStr } = await window.CdrFileStage.stageToolCall(
      call,
      (p) => HC.code.readFile(p),
      { onEntry: (e) => queueStagedEntry(e) }
    );
    if (yolo) {
      await window.CdrFileStage.applyEntry(
        entry,
        (p, c, r) => HC.code.writeFile(p, c, r),
        (p, r) => HC.code.deleteFile(p, r)
      );
      entry.status = 'accepted';
      entry.applied = true;
      return JSON.stringify({
        ok: true,
        applied: true,
        path: entry.path,
        message: 'YOLO: change applied to disk immediately (revert still available).',
      });
    }
    return resultStr;
  }

  async function legacyRun(assistant, { signal, onStatus }) {
    const H = window._H;
    if (!H) throw new Error('_H bridge not ready');
    assistant._toolBlocks = [];
    const tools    = buildLegacyTools();
    const messages = buildMessages();
    const temperature = H.selectedTemperature ? Math.min(H.selectedTemperature(), 0.4) : 0.2;
    const MAX_ITER = 8;
    let iter = 0, finalText = '';
    while (iter < MAX_ITER) {
      iter++;
      onStatus(`Thinking (step ${iter})…`, 'thinking');
      if (signal?.aborted) break;
      const turn = await callWithRouter(messages, tools, temperature, signal);
      if (turn && turn.tool_calls && turn.tool_calls.length) {
        H.appendAssistantToolCallTurn(messages, turn.content, turn.tool_calls);
        for (const call of turn.tool_calls) {
          if (signal?.aborted) return;
          onStatus(`${call.name}…`, 'running');
          const t0 = performance.now();
          let resultStr, ok = true;
          try {
            if (window.CdrFileStage?.isStagedTool?.(call.name)) {
              resultStr = await runStagedTool(call);
            } else {
              const def = (HC?.code?.TOOL_DEFINITIONS || []).find(t => t.name === call.name);
              if (!def) throw new Error('Unknown tool: ' + call.name);
              const raw = await def.fn(call.arguments || {});
              if (raw == null) resultStr = '{"ok":true}';
              else resultStr = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
            }
          } catch (e) { resultStr = JSON.stringify({ error: String(e?.message || e) }); ok = false; }
          const ms = Math.round(performance.now() - t0);
          assistant._toolBlocks.push({ name: call.name, args: call.arguments || {}, result: resultStr, ms, ok });
          const pathArg = call.arguments?.path || call.arguments?.dir;
          if (pathArg) sharedState.activeFile = pathArg;
          onStatus(`${call.name} done (${assistant._toolBlocks.length} tool${assistant._toolBlocks.length > 1 ? 's' : ''} used)`, 'done');
          H.appendToolResult(messages, call, resultStr);
        }
        continue;
      }
      finalText = turn.content || '';
      assistant.content = finalText;
      H.updateLastBubble && H.updateLastBubble(finalText);
      return finalText;
    }
    onStatus('Max iterations reached — finalizing', 'warn');
    assistant.content = finalText || '(Max iterations reached.)';
    H.updateLastBubble && H.updateLastBubble(assistant.content);
    return finalText;
  }

  return { legacyRun, buildMessages, buildLegacyTools };
}
