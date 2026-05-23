/**
 * Coder agent run loop — tools, system prompt, agentLoop, swarm modes, start/stop.
 */
import { baseName } from './dom-utils.js';
import { callWithRouter, buildRouterChain } from './router.js';

export function createAgentRunApi(ctx) {
  const {
    $,
    esc,
    sharedState,
    modelRef,
    conversationMsgs,
    tabMgr,
    getAgentCount,
    MAX_CONCURRENT,
    getIdeCtx,
    getGraphifyContext,
    getSkillsForPrompt,
    getRunAbort,
    setRunAbort,
    getRunGeneration,
    bumpRunGeneration,
    getRunTabId,
    setRunTabId,
    getRunFileChanges,
    setRunFileChanges,
    getActiveContentEl,
    setActiveContentEl,
    incDomScrollBatch,
    decDomScrollBatch,
    setStatus,
    cdrTraceAdd,
    cdrTraceReset,
    updateCoderContextChip,
    activeModelValue,
    appendThinking,
    appendToolBlock,
    finalizeToolBlock,
    scrollMessages,
    appendTextToBubble,
    appendUserMsg,
    appendAssistantBubble,
    enterChatLiveMode,
    autoResize,
    loadGraphifyContextForTask,
    renderTabBar,
    saveCoderState,
    enforceThreeWordName,
    addChangeEntry,
    addAIFileToExplorer,
    setChangeRowState,
    terminalLog,
    activeFileChanges,
    abortActiveRun,
    setRouterChip,
  } = ctx;

  const HC = () => window.HC;

  function buildTools() {
    if (getIdeCtx()?.isPlanOnly?.()) return [];
    return (HC()?.code?.TOOL_DEFINITIONS || []).map(t => ({
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

  function sysPrompt(extra) {
    const root = sharedState.projectRoot;
    let homeDir = sharedState.homeDir || '';
    if (!homeDir && root) {
      const parts = root.split('/').filter(Boolean);
      if (parts[0] === 'Users' && parts[1]) homeDir = `/Users/${parts[1]}`;
      else if (parts[0] === 'home' && parts[1]) homeDir = `/home/${parts[1]}`;
    }

    const lines = [
      'You are MiraXcode Coder — a precise coding agent.',
    ];
    if (getIdeCtx()?.isPlanOnly?.()) {
      lines.push(
        'PLAN MODE (active): Do not use tools. Reply with a structured plan only — steps, files, risks, and verification.',
        'Use markdown headings and numbered steps. No file writes until the user disables Plan mode.'
      );
    } else {
      lines.push(
        'Rules:',
        '1. One change at a time. Use tool calls for any file/shell action — do not narrate plans.',
        '2. Replies must be ≤3 short sentences unless the user asks for detail.',
        '3. For code edits, return only the changed region. No surrounding context.',
        '4. Never call tools for greetings or conversational questions — answer in plain text.',
        '5. Blocked paths: /System, /etc, /private, /usr, /bin — refuse without asking.',
      );
    }
    if (root) {
      lines.push(`Project root: ${root}`);
      lines.push(`6. If the project directory is empty or new, immediately start creating files — do NOT explore the filesystem first.`);
      if (sharedState.activeFile) lines.push(`Active file: ${sharedState.activeFile}`);
    } else {
      lines.push(`No project open. Home: ${homeDir || 'unknown'}. Ask user to open a folder for write ops.`);
    }

    const task = conversationMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    try {
      const memBlock = HC()?.coderMemory?.formatMergedForPrompt?.(root, task);
      if (memBlock) lines.push(memBlock.trim());
      else if (window._H?.memRecall) {
        const scored = window._H.memRecall(task, 8);
        if (scored?.length) {
          lines.push('Memory (silent context, do not recite):');
          scored.forEach(f => lines.push(`  - ${f.key}: ${String(f.value).slice(0, 160)}`));
        }
      }
    } catch { /* ignore memory errors */ }

    const graphifyContext = getGraphifyContext?.() || '';
    if (graphifyContext) {
      lines.push(HC()?.coderGraphify?.formatPromptBlock?.(root, graphifyContext) || graphifyContext);
    } else if (root && HC()?.coderGraphify) {
      lines.push(
        'Graphify: graphify-out/ will be used when available. Call graphify_report or graphify_query before blind repo search.'
      );
    }

    if (HC()?.guard?.isYolo?.()) {
      lines.push('YOLO mode: run tools and shell without permission prompts (hard-blocked paths/commands still denied).');
    } else if (HC()?.guard?.isBypassPermissions?.()) {
      lines.push('Bypass permissions: approve tool/shell actions without prompts (hard-blocked still denied).');
    }

    const skills = getSkillsForPrompt?.();
    const skList = skills?.length ? skills : (HC()?.coderSkills?.getCached?.() || []);
    const skBlock = HC()?.coderSkills?.formatSkillsForPrompt?.(skList);
    if (skBlock) lines.push(skBlock);

    const richBase = HC()?.code?.SYSTEM_PROMPT || '';
    const out = (richBase ? richBase + '\n' : '') + lines.join('\n');
    return out + (extra ? '\n' + extra : '');
  }

  async function prepareMessagesForModel(msgs, signal) {
    const tab = tabMgr.active();
    const modelValue = activeModelValue();
    if (!HC()?.contextCompactor?.prepareForApi) {
      return HC()?.contextCompactor?.trimAllTools?.(msgs, 1200) || msgs;
    }
    const prepared = await HC().contextCompactor.prepareForApi(msgs, {
      modelValue,
      signal,
      ledger: tab?.compactionLedger || '',
      cacheKey: tab?.id || 'coder',
      onStatus: (t) => { if (t) setStatus(t, 'thinking'); },
      onLedgerUpdate: (ledger) => {
        if (tab) {
          tab.compactionLedger = ledger;
          tabMgr.save();
        }
      },
    });
    updateCoderContextChip(prepared);
    return prepared;
  }

  async function agentLoop(messages, tools, contentEl, label, signal) {
    const H = window._H;
    const temperature = H?.selectedTemperature ? Math.min(H.selectedTemperature(), 0.35) : 0.15;
    setActiveContentEl(contentEl);
    const runTabId = getRunTabId();
    const yolo = !!HC()?.guard?.isYolo?.();
    const MAX_ITER = yolo ? 40 : 16;
    let iter = 0;
    let thinkEl = appendThinking(contentEl);
    let reasoningEl = null;

    try {
      while (iter < MAX_ITER) {
        iter++;

        setStatus(`${label ? label + ' · ' : ''}Thinking…`, 'thinking');
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const baseMsgs = iter === MAX_ITER
          ? [...messages, { role: 'user', content: 'Stop calling tools now. Write a 2-sentence summary of what was done and any leftover.' }]
          : messages;
        const callMessages = await prepareMessagesForModel(baseMsgs, signal);
        if (callMessages.length < baseMsgs.length) {
          const ctxU = HC()?.contextCompactor?.usageRatio?.(callMessages, activeModelValue());
          cdrTraceAdd('Context', `Compacted · ~${ctxU?.estimated || '?'} tok`, 'run');
        }

        cdrTraceAdd('Step', `Iter ${iter}${label ? ' · ' + label : ''} · calling model`, 'run');
        let turn;
        let liveStreamActive = false;
        const onToken = (_delta, full) => {
          if (signal?.aborted || getRunTabId() !== runTabId) return;
          if (!liveStreamActive) {
            getIdeCtx()?.beginStreamBubble?.(contentEl);
            liveStreamActive = true;
          }
          getIdeCtx()?.updateStreamBubble?.(full);
          scrollMessages();
        };
        try {
          turn = await callWithRouter(callMessages, tools, temperature, signal, modelRef.current, onToken);
        } catch (e) {
          if (liveStreamActive) getIdeCtx()?.cancelStreamBubble?.();
          thinkEl?.remove(); thinkEl = null;
          reasoningEl?.remove(); reasoningEl = null;
          cdrTraceAdd('Error', e?.message || String(e), 'err');
          const errDiv = document.createElement('div');
          errDiv.className = 'cdr-msg-text';
          errDiv.style.color = 'var(--cdr-error)';
          errDiv.style.borderLeft = '2px solid var(--cdr-error)';
          errDiv.style.paddingLeft = '10px';
          errDiv.style.margin = '8px 0';
          errDiv.innerHTML = `<b>Error</b><br>${esc(e?.message || String(e))}`;
          contentEl.appendChild(errDiv);
          scrollMessages();
          throw e;
        }
        thinkEl?.remove(); thinkEl = null;

        if (turn.tool_calls?.length) {
          if (liveStreamActive) {
            getIdeCtx()?.cancelStreamBubble?.();
            liveStreamActive = false;
          }
          if (turn.content) {
            if (!reasoningEl) {
              reasoningEl = document.createElement('div');
              reasoningEl.className = 'cdr-thinking-stream';
              contentEl.appendChild(reasoningEl);
            }
            reasoningEl.innerHTML = `<div class="cdr-thinking-hd">Reasoning</div>${esc(turn.content)}`;
            reasoningEl.classList.remove('empty');
            scrollMessages();
          }
        }

        if (turn.tool_calls?.length) {
          H.appendAssistantToolCallTurn(messages, turn.content, turn.tool_calls);
          incDomScrollBatch();
          try {
            for (const call of turn.tool_calls) {
              if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

              if (call.name === 'shell_run') {
                const cmd = call.arguments?.command || '';
                const args = (call.arguments?.args || []).join(' ');
                const cwd = call.arguments?.cwd || sharedState.projectRoot || '';
                const preview = cwd ? `cd ${cwd} && ${cmd} ${args}` : `${cmd} ${args}`;
                terminalLog('[' + call.name + ' preview] ' + preview, 'cdr-bash-preview');
              }

              const toolEl = appendToolBlock(contentEl, call.name, call.arguments);
              setStatus(`${call.name}…`, 'run');
              const pathHint = call.arguments?.path || call.arguments?.dir || call.arguments?.command || '';
              cdrTraceAdd('Tool', call.name + (pathHint ? ' · ' + String(pathHint).split('/').pop() : ''), 'run');
              const t0 = performance.now();
              let resultStr, ok = true;
              try {
                if (window.CdrFileStage?.isStagedTool?.(call.name)) {
                  const fcRun = activeFileChanges();
                  const changeIdx = fcRun.length;
                  const stagedOut = await window.CdrFileStage.stageToolCall(
                    call,
                    (p) => HC().code.readFile(p),
                    {
                      onEntry: (entry) => {
                        addChangeEntry(entry.name, entry.path, entry.kind, entry.content, entry);
                      },
                    }
                  );
                  resultStr = stagedOut.resultStr;
                  if (yolo && ok) {
                    const fcEntry = fcRun[changeIdx];
                    try {
                      await window.CdrFileStage.applyEntry(
                        fcEntry,
                        (p, c, r) => HC().code.writeFile(p, c, r),
                        (p, r) => HC().code.deleteFile(p, r)
                      );
                      addAIFileToExplorer(fcEntry.path, fcEntry.kind || 'write');
                      const row = contentEl?.querySelector(
                        `.cdr-change-row[data-change-idx="${changeIdx}"]`
                      );
                      if (row) await setChangeRowState(row, 'accepted');
                      resultStr = JSON.stringify({
                        ok: true,
                        applied: true,
                        path: fcEntry.path,
                        message: 'YOLO: change applied to disk immediately (revert still available).',
                      });
                    } catch (applyErr) {
                      ok = false;
                      resultStr = JSON.stringify({ error: String(applyErr?.message || applyErr) });
                    }
                  }
                } else {
                  const def = (HC()?.code?.TOOL_DEFINITIONS || []).find(t => t.name === call.name);
                  if (!def) throw new Error('Unknown tool: ' + call.name);
                  const raw = await def.fn(call.arguments || {});
                  resultStr = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
                }
              } catch (e) {
                resultStr = JSON.stringify({ error: String(e?.message || e) }); ok = false;
              }
              const ms = Math.round(performance.now() - t0);
              cdrTraceAdd('Tool', call.name + ' · ' + ms + 'ms', ok ? 'ok' : 'err');
              finalizeToolBlock(toolEl, resultStr, ok, ms);
              if (!ok && getIdeCtx()?.reportProblems && window.CdrDiagnostics?.parseOutput) {
                const parsed = window.CdrDiagnostics.parseOutput(resultStr);
                if (parsed.length) getIdeCtx().reportProblems(parsed);
              }

              H.appendToolResult(messages, call, resultStr);
            }
          } finally {
            decDomScrollBatch();
          }
          scrollMessages();
          thinkEl = appendThinking(contentEl);
          continue;
        }

        reasoningEl?.remove(); reasoningEl = null;
        const finalText = turn.content || '';
        if (!finalText.trim()) {
          cdrTraceAdd('Done', 'Empty response from model', 'warn');
          appendTextToBubble(contentEl, '*No response from model. Try again or check your model settings.*');
        } else {
          cdrTraceAdd('Done', (label || 'Agent') + ' · ' + finalText.length + ' chars', 'ok');
          if (liveStreamActive) {
            getIdeCtx()?.endStreamBubble?.(contentEl, finalText);
          } else {
            appendTextToBubble(contentEl, finalText);
          }
        }
        return finalText;
      }

      reasoningEl?.remove(); reasoningEl = null;
      while (messages.length && messages[messages.length - 1].role === 'tool') messages.pop();
      while (messages.length && messages[messages.length - 1].role === 'assistant' &&
             Array.isArray(messages[messages.length - 1].tool_calls)) messages.pop();
      cdrTraceAdd('Done', 'Max iterations reached', 'warn');
      if (yolo && !signal?.aborted) {
        messages.push({
          role: 'user',
          content: 'Continue from where you left off. Finish remaining work with tool calls as needed, then summarize.',
        });
        cdrTraceAdd('YOLO', 'Auto-continuing after max iterations', 'run');
        return agentLoop(messages, tools, contentEl, label, signal);
      }
      appendTextToBubble(contentEl, '*Task paused — reply to continue or click regen to retry.*');
      return '';
    } finally {
      if (getActiveContentEl() === contentEl) setActiveContentEl(null);
    }
  }

  async function expandTaskMentions(task) {
    let t = task;
    if (getIdeCtx()?.expandCodebase) {
      t = await getIdeCtx().expandCodebase(t);
    }
    const root = sharedState.projectRoot;
    if (!root || !t.includes('@')) return t;
    const re = /@([^\s@]+)/g;
    let extra = '';
    let m;
    while ((m = re.exec(t)) !== null) {
      const rel = m[1].replace(/\/$/, '');
      const full = rel.startsWith('/') ? rel : `${root.replace(/\/$/, '')}/${rel}`;
      try {
        const content = await HC().code.readFile(full);
        extra += `\n\n--- @${rel} ---\n${String(content).slice(0, 12_000)}`;
      } catch { /* skip missing paths */ }
    }
    return extra ? t + extra : t;
  }

  async function startRun() {
    const taskInput = $('cdrTaskInput');
    const task = taskInput?.value?.trim();
    const hasAttach = window.CdrComposerAttachments?.hasPending?.();
    if (!task && !hasAttach) { taskInput?.focus(); return; }

    const attachHtml = window.CdrComposerAttachments?.renderUserAttachmentHtml?.() || '';
    const userPayload = window.CdrComposerAttachments?.buildUserMessagePayload?.(task || '(see attached files)') || { role: 'user', content: task || '(see attached files)' };

    taskInput.value = '';
    autoResize(taskInput);

    enterChatLiveMode();
    appendUserMsg(task || '(see attached files)', attachHtml);

    try { window._H?.memAutoExtract?.(task); } catch {}
    try { HC()?.coderMemory?.extractFromUserMessage?.(sharedState.projectRoot, task); } catch {}
    await loadGraphifyContextForTask(task);

    if (!conversationMsgs.length) {
      conversationMsgs.push({ role: 'system', content: sysPrompt() });
    } else if (conversationMsgs[0]?.role === 'system') {
      conversationMsgs[0].content = sysPrompt();
    }
    const modelTask = await expandTaskMentions(userPayload.content);
    const userMsg = { ...userPayload, content: modelTask };
    conversationMsgs.push(userMsg);
    window.CdrComposerAttachments?.clear?.();
    updateCoderContextChip(conversationMsgs);

    const tab = tabMgr.active();
    if (tab && (!tab.title || tab.title.startsWith('Session'))) {
      tab.title = enforceThreeWordName(task);
      renderTabBar();
    }

    const runBtn  = $('cdrRunBtn');
    const stopBtn = $('cdrStopBtn');
    if (runBtn)  runBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';

    const gen = bumpRunGeneration();
    if (getRunAbort()) abortActiveRun('New run');
    setRunAbort(new AbortController());
    const { signal } = getRunAbort();
    setRunTabId(tab?.id || tabMgr.activeId || null);
    setRunFileChanges(ctx.fileChanges);

    setStatus('Thinking…', 'thinking');
    cdrTraceReset('Run started');

    if (tab) { tab.running = true; renderTabBar(); }

    try {
      const swarmMode = (document.getElementById('cdrSwarmMode')?.value || 'boss');
      const count = getAgentCount();
      if (count === 1) {
        await runSingleTurn(signal);
      } else if (swarmMode === 'vote') {
        await runAllVote(task, count, signal);
      } else if (swarmMode === 'chain') {
        await runChainRefine(task, count, signal);
      } else {
        await runMultiTurn(task, count, signal);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        const c = appendAssistantBubble('MiraXCode Coder');
        if (c) appendTextToBubble(c, '*Stopped.*');
        setStatus('Stopped', '');
      } else {
        setStatus(e?.message || 'Error', 'err');
        console.error('[CoderMode] run failed:', e);
      }
    } finally {
      if (gen !== getRunGeneration()) return;
      if (runBtn)  runBtn.style.display = '';
      if (stopBtn) stopBtn.style.display = 'none';
      setRunAbort(null);
      setRunTabId(null);
      setRunFileChanges(null);
      setRouterChip('Auto', '');
      const at = tabMgr.active();
      if (at) { at.running = false; renderTabBar(); }
    }
  }

  async function runSingleTurn(signal) {
    const tools     = buildTools();
    const contentEl = appendAssistantBubble('MiraXCode Coder');
    const finalText = await agentLoop(conversationMsgs, tools, contentEl, '', signal);
    if (finalText) {
      conversationMsgs.push({ role: 'assistant', content: finalText });
      try { window._H?.memAutoExtractFromAssistant?.(finalText); } catch {}
      try { HC()?.coderMemory?.extractFromAssistant?.(sharedState.projectRoot, finalText); } catch {}
    }
    saveCoderState();
    setStatus('Ready', '');
  }

  async function runMultiTurn(task, count, signal) {
    if (!sharedState.projectRoot) {
      const el = appendAssistantBubble('MiraXCode Coder');
      appendTextToBubble(el, 'Multi-agent mode works best with a project open. Click **Open Project** to select your project folder, then try again.');
      setStatus('Ready', '');
      return;
    }

    const bossEl   = appendAssistantBubble('Boss');
    const thinkEl  = appendThinking(bossEl);
    const planMsgs = [
      { role: 'system', content: `You are a task planner. Split the user's request into exactly ${count - 1} independent coding sub-tasks. Reply ONLY with a valid JSON array:\n[{"id":"1","task":"..."},...]` },
      { role: 'user',   content: `Decompose for ${count - 1} parallel agents: ${task}` }
    ];
    let subTasks;
    try {
      const planTurn = await callWithRouter(planMsgs, [], 0.25, signal, modelRef.current);
      thinkEl?.remove();
      const m = (planTurn.content || '').match(/\[[\s\S]*?\]/);
      subTasks = m ? JSON.parse(m[0]) : null;
    } catch { thinkEl?.remove(); }

    if (!subTasks?.length) {
      subTasks = Array.from({ length: count - 1 }, (_, i) => ({
        id: String(i + 1), task: `Part ${i + 1}: ${task}`
      }));
    }
    appendTextToBubble(bossEl, `Coordinating **${count - 1} sub-agent${count - 1 > 1 ? 's' : ''}** for this task.`);
    setStatus('Agents running…', 'thinking');

    cdrTraceAdd('Boss', `Decomposed into ${subTasks.length} sub-task${subTasks.length !== 1 ? 's' : ''}`, 'ok');
    const results = [];
    for (let batch = 0; batch < subTasks.length; batch += MAX_CONCURRENT) {
      if (signal?.aborted) break;
      const batchTasks = subTasks.slice(batch, batch + MAX_CONCURRENT);
      const batchResults = await Promise.all(batchTasks.map(async (st, j) => {
        const idx = batch + j + 2;
        cdrTraceAdd(`Agent ${idx}`, (st.task || task).slice(0, 60), 'run');
        const wEl   = appendAssistantBubble(`Agent ${idx}`);
        const wMsgs = [
          { role: 'system', content: sysPrompt(`You are sub-agent ${idx} of ${count}. Focus only on your assigned task.`) },
          { role: 'user',   content: st.task || task }
        ];
        try {
          const result = await agentLoop(wMsgs, buildTools(), wEl, `Agent ${idx}`, signal);
          cdrTraceAdd(`Agent ${idx}`, 'Finished', 'ok');
          return result;
        } catch (e) {
          cdrTraceAdd(`Agent ${idx}`, e?.message || 'Failed', 'err');
          appendTextToBubble(wEl, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
          return '';
        }
      }));
      results.push(...batchResults);
      setStatus(`Agents ${Math.min(batch + MAX_CONCURRENT, subTasks.length)}/${subTasks.length} done…`, 'thinking');
    }

    const synthEl   = appendAssistantBubble('Boss — Synthesis');
    const agentSummary = results
      .map((r, i) => `### Agent ${i + 2}\n${(r || '(no output)').slice(0, 1200)}`)
      .join('\n\n');
    const synthMsgs = [
      { role: 'system', content: sysPrompt('You are the synthesis boss. Your job is to combine the sub-agent results into one clear, complete final answer. Do NOT call any tools — write your synthesis directly.') },
      {
        role: 'user',
        content: `Original task: ${task}\n\nProject: ${sharedState.projectRoot}\n\nSub-agent results:\n${agentSummary}\n\nWrite a clear synthesis: what was done, what changed, and what (if anything) still needs attention.`
      }
    ];
    setStatus('Synthesizing…', 'thinking');
    const finalText = await agentLoop(synthMsgs, [], synthEl, 'Boss', signal);
    if (finalText) conversationMsgs.push({ role: 'assistant', content: finalText });
    saveCoderState();
    setStatus('Ready', '');
  }

  async function runAllVote(task, count, signal) {
    cdrTraceAdd('AllVote', `Sending to ${count} model(s) simultaneously`, 'run');

    const chain = buildRouterChain(modelRef.current);
    const voterAdapters = chain.slice(0, count);
    if (!voterAdapters.length) {
      const el = appendAssistantBubble('AllVote');
      appendTextToBubble(el, 'No models available. Add API keys in Settings.');
      setStatus('Ready', '');
      return;
    }

    const votes = [];
    for (let batch = 0; batch < voterAdapters.length; batch += MAX_CONCURRENT) {
      if (signal?.aborted) break;
      const batchAdapters = voterAdapters.slice(batch, batch + MAX_CONCURRENT);
      const batchVotes = await Promise.all(batchAdapters.map(async (adapter, j) => {
        const idx = batch + j + 1;
        const label = adapter.label || `Model ${idx}`;
        const vEl = appendAssistantBubble(`Vote ${idx} — ${label}`);
        cdrTraceAdd(label, 'Answering…', 'run');
        setStatus(`Vote ${idx}/${voterAdapters.length}…`, 'thinking');
        try {
          const msgs = [
            { role: 'system', content: sysPrompt('Answer the user request directly and thoroughly.') },
            { role: 'user', content: task }
          ];
          const result = await callWithRouter(msgs, buildTools(), 0.7, signal, adapter.kind === 'ollama' ? adapter.model : null);
          const text = result?.content || '';
          appendTextToBubble(vEl, text);
          cdrTraceAdd(label, 'Done', 'ok');
          return { label, text };
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          cdrTraceAdd(label, e?.message || 'Failed', 'err');
          appendTextToBubble(vEl, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
          return { label, text: '' };
        }
      }));
      votes.push(...batchVotes);
    }

    const judgeEl = appendAssistantBubble('Judge — Best Answer');
    setStatus('Judging…', 'thinking');
    cdrTraceAdd('Judge', 'Picking best answer', 'run');

    const judgePrompt = `Original task: ${task.slice(0, 500)}

${votes.map((v, i) => `### Response ${i + 1} (${v.label}):\n${v.text.slice(0, 1500)}`).join('\n---\n')}

Pick the best response or merge them into one final answer. Provide the complete answer.`;

    const judgeMsgs = [
      { role: 'system', content: sysPrompt('You are a judge. Pick or merge the best response into one clear, complete answer. Write the full answer, not just which one you picked.') },
      { role: 'user', content: judgePrompt }
    ];
    const finalText = await agentLoop(judgeMsgs, [], judgeEl, 'Judge', signal);
    if (finalText) conversationMsgs.push({ role: 'assistant', content: finalText });
    saveCoderState();
    cdrTraceAdd('Judge', 'Verdict ready', 'ok');
    setStatus('Ready', '');
  }

  async function runChainRefine(task, steps, signal) {
    cdrTraceAdd('Chain', `Starting ${steps}-step refinement`, 'run');

    const chain = buildRouterChain(modelRef.current);
    const stages = [
      'Write an initial answer',
      'Review and improve — fix errors, add depth',
      'Polish — clearer structure, better formatting',
      'Final pass — concise, complete, well-formatted',
      'Ultimate refinement — production quality output'
    ];

    let current = task;

    for (let i = 0; i < steps; i++) {
      if (signal?.aborted) break;
      const adapter = chain[i % chain.length];
      const label = adapter?.label || `Step ${i + 1}`;
      const stage = stages[i] || 'Improve and refine the previous output';
      const el = appendAssistantBubble(`Step ${i + 1} — ${label}`);
      setStatus(`Chain step ${i + 1}/${steps}…`, 'thinking');
      cdrTraceAdd(label, stage.slice(0, 50), 'run');

      const prompt = i === 0 ? task : `${stage}:\n\n${current.slice(0, 2000)}`;
      const msgs = [
        { role: 'system', content: sysPrompt(`You are step ${i + 1} in a refinement chain. ${stage}.`) },
        { role: 'user', content: prompt }
      ];
      try {
        const result = await callWithRouter(msgs, buildTools(), 0.5, signal, adapter?.kind === 'ollama' ? adapter?.model : null);
        current = result?.content || current;
        appendTextToBubble(el, current);
        cdrTraceAdd(label, 'Done', 'ok');
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        cdrTraceAdd(label, e?.message || 'Failed', 'err');
        appendTextToBubble(el, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
      }
    }

    if (current && current !== task) {
      conversationMsgs.push({ role: 'assistant', content: current });
    }
    saveCoderState();
    cdrTraceAdd('Chain', 'Complete', 'ok');
    setStatus('Ready', '');
  }

  function stopRun() {
    bumpRunGeneration();
    abortActiveRun('Stopped');
    setStatus('Stopped', '');
  }

  return {
    buildTools,
    sysPrompt,
    prepareMessagesForModel,
    agentLoop,
    expandTaskMentions,
    startRun,
    stopRun,
    runSingleTurn,
    runMultiTurn,
    runAllVote,
    runChainRefine,
  };
}
