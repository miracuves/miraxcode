/**
 * Agent Swarm + Canvas bridge — multi-model orchestration modes.
 * Exposed via window._H.runSwarm / ollamaChat for swarm-maker, forge, sandbox.
 */

export function createSwarmApi(deps) {
  const {
    streamWithModelValue,
    escapeHtml,
    state,
    render,
    persistCurrentChat,
    getCurrentModel,
  } = deps;

  let workflowAbort = null;
  let swarmAbort = null;

  async function ollamaChat(model, messages, onToken, signal) {
    if (model && model.startsWith("cloud:")) {
      let full = "";
      await streamWithModelValue({
        modelValue: model,
        messages,
        onToken: (tok) => { full += tok; if (onToken) onToken(tok, full); },
        onStats: null,
        signal,
        temperature: 0.7,
      });
      return full;
    }
    const host = window.MiraXcodeRuntime ? window.MiraXcodeRuntime.getHost() : "http://localhost:11434";
    const resp = await fetch(host + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
    if (!resp.ok) throw new Error("Ollama error: " + resp.status);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const tok = obj.message?.content || "";
          full += tok;
          if (onToken) onToken(tok, full);
        } catch {}
      }
    }
    return full;
  }

  const SwarmState = { active: false, mode: null, log: [] };

  function sanitizeSwarmLogStatus(status) {
    const s = status || "info";
    return s === "done" || s === "err" || s === "info" ? s : "info";
  }

  function swarmLog(agentLabel, text, status) {
    SwarmState.log.push({
      agentLabel,
      text,
      status: sanitizeSwarmLogStatus(status),
      ts: Date.now(),
    });
    renderSwarmLog();
  }

  function renderSwarmLog() {
    const logEl = document.getElementById("swarm-log-entries");
    if (!logEl) return;
    logEl.innerHTML = SwarmState.log.slice(-30).reverse().map(e => {
      const st = sanitizeSwarmLogStatus(e.status);
      return `<div class="swarm-log-entry ${st}">
        <span class="agent-tag">[${escapeHtml(e.agentLabel)}]</span>${escapeHtml(e.text)}
      </div>`;
    }).join("");
  }

  async function runBossTeam(task, workerModels, signal) {
    SwarmState.active = true;
    const currentModel = getCurrentModel();
    swarmLog("Boss", "Breaking down the task…");

    const planPrompt = `You are the Boss. Task: "${task.slice(0, 400)}"
Workers: ${workerModels.join(", ")}
Reply with a JSON array only, no extra text:
[{"w":"model_name","t":"brief task for that worker"},...]`;

    let planText = "";
    try {
      planText = await ollamaChat(currentModel, [
        { role: "system", content: "Reply with a JSON array only. No explanation." },
        { role: "user", content: planPrompt }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; planText = ""; }

    let subtasks;
    try { const m = planText.match(/\[[\s\S]*\]/); subtasks = m ? JSON.parse(m[0]) : null; } catch { subtasks = null; }
    if (!subtasks || !subtasks.length) subtasks = workerModels.map(w => ({ w, t: task }));
    swarmLog("Boss", `Assigned ${subtasks.length} task(s). Workers running…`, "done");

    const results = await Promise.all(subtasks.map(async (st, i) => {
      const wModel = st.w || workerModels[i % workerModels.length];
      swarmLog(wModel, `Working: "${(st.t || task).slice(0, 60)}…"`);
      let result = "";
      try {
        result = await ollamaChat(wModel, [
          { role: "system", content: "You are a focused worker. Complete the task clearly and concisely." },
          { role: "user", content: st.t || task }
        ], null, signal);
      } catch (e) { if (e.name === "AbortError") throw e; result = `[Error: ${e.message}]`; }
      swarmLog(wModel, `Done (${result.split(" ").length} words)`, "done");
      return { model: wModel, task: st.t || task, result };
    }));

    swarmLog("Boss", "Combining results…");
    const synthPrompt = `Task was: "${task.slice(0, 300)}"
Worker results:
${results.map((r, i) => `Worker ${i + 1} (${r.model}): ${r.result.slice(0, 500)}`).join("\n---\n")}
Write a clear final answer combining all the above.`;

    let synthesis = "";
    try {
      synthesis = await ollamaChat(currentModel, [
        { role: "system", content: "Synthesize the worker outputs into one clear final answer." },
        { role: "user", content: synthPrompt }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; synthesis = results.map(r => r.result).join("\n\n"); }

    swarmLog("Boss", "Final answer ready.", "done");
    SwarmState.active = false;
    return { mode: "boss-team", label: "Boss Team", results, synthesis };
  }

  async function runAllVote(task, voterModels, signal) {
    SwarmState.active = true;
    swarmLog("AllVote", `Sending to ${voterModels.length} model(s) simultaneously…`);
    const currentModel = getCurrentModel();

    const votes = await Promise.all(voterModels.map(async (model) => {
      swarmLog(model, "Answering…");
      let answer = "";
      try {
        answer = await ollamaChat(model, [{ role: "user", content: task }], null, signal);
      } catch (e) { if (e.name === "AbortError") throw e; answer = `[Error: ${e.message}]`; }
      swarmLog(model, "Done", "done");
      return { model, answer };
    }));

    swarmLog("Judge", "Picking the best answer…");
    const judgePrompt = `Question: "${task.slice(0, 300)}"
${votes.map((v, i) => `Response ${i + 1} (${v.model}):\n${v.answer.slice(0, 400)}`).join("\n---\n")}
Pick the best response or merge them into one final answer. Start with "BEST:" then the answer.`;

    let verdict = "";
    try {
      verdict = await ollamaChat(currentModel, [
        { role: "system", content: "You are a judge. Pick or merge the best response into one clear answer." },
        { role: "user", content: judgePrompt }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; verdict = votes[0]?.answer || ""; }

    swarmLog("Judge", "Verdict ready.", "done");
    SwarmState.active = false;
    return { mode: "all-vote", label: "All Vote", votes, verdict };
  }

  async function runChainRefine(task, models, signal) {
    SwarmState.active = true;
    swarmLog("Chain", `Starting ${models.length}-step refinement chain…`);

    const stages = [
      "Write an initial answer",
      "Review and improve the previous answer — fix errors, add depth",
      "Polish: make it clearer and better structured",
      "Final pass: concise, well-formatted, complete"
    ];

    let current = task;
    const history = [];

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const stage = stages[i] || "Improve and refine the previous output";
      const prompt = i === 0 ? task : `${stage}:\n\n${current.slice(0, 1200)}`;
      swarmLog(model, `Step ${i + 1}: ${stage.slice(0, 50)}…`);
      let output = "";
      try {
        output = await ollamaChat(model, [
          { role: "system", content: `You are step ${i + 1} in a refinement chain. ${stage}.` },
          { role: "user", content: prompt }
        ], null, signal);
      } catch (e) { if (e.name === "AbortError") throw e; output = `[Error: ${e.message}]`; }
      swarmLog(model, `Step ${i + 1} done`, "done");
      history.push({ step: i + 1, model, stage, output });
      current = output;
    }

    SwarmState.active = false;
    return { mode: "chain-refine", label: "Chain Refine", history, final: current };
  }

  async function runDevilsAdvocate(task, models, signal) {
    SwarmState.active = true;
    const currentModel = getCurrentModel();
    const proposer   = models[0] || currentModel;
    const challenger = models[1] || models[0] || currentModel;
    const resolver   = models[2] || currentModel;

    swarmLog("Proposer", `Proposing with ${proposer}…`);
    let proposal = "";
    try {
      proposal = await ollamaChat(proposer, [
        { role: "system", content: "Give a clear, confident answer." },
        { role: "user", content: task }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; proposal = "[Error]"; }
    swarmLog("Proposer", "Proposal ready.", "done");

    swarmLog("Challenger", `Challenging with ${challenger}…`);
    let challenge = "";
    try {
      challenge = await ollamaChat(challenger, [
        { role: "system", content: "You are a devil's advocate. Find flaws, missing points, and counter-arguments in the answer below." },
        { role: "user", content: `Task: ${task.slice(0, 300)}\n\nProposed answer:\n${proposal.slice(0, 600)}` }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; challenge = "[Error]"; }
    swarmLog("Challenger", "Challenge ready.", "done");

    swarmLog("Resolver", `Resolving with ${resolver}…`);
    let resolution = "";
    try {
      resolution = await ollamaChat(resolver, [
        { role: "system", content: "Given a proposal and a challenge, write the best possible final answer that incorporates valid criticisms." },
        { role: "user", content: `Task: ${task.slice(0, 300)}\n\nProposal:\n${proposal.slice(0, 400)}\n\nChallenge:\n${challenge.slice(0, 400)}\n\nWrite the improved final answer.` }
      ], null, signal);
    } catch (e) { if (e.name === "AbortError") throw e; resolution = proposal; }
    swarmLog("Resolver", "Resolution ready.", "done");

    SwarmState.active = false;
    return { mode: "devils-advocate", label: "Devil's Advocate", proposal, challenge, resolution };
  }

  function showSwarmResult(result) {
    const box   = document.getElementById("cv-swarm-result-box");
    const body  = document.getElementById("cv-swarm-result-body");
    const title = document.getElementById("cv-swarm-result-title");
    if (!box || !body) return;
    let content = "";
    if      (result.mode === "boss-team")       content = result.synthesis;
    else if (result.mode === "all-vote")        content = result.verdict;
    else if (result.mode === "chain-refine")    content = result.final;
    else if (result.mode === "devils-advocate") content = result.resolution;
    if (title) title.textContent = (result.label || result.mode) + " — Result";
    body.textContent = content;
    box.classList.add("visible");
  }

  function injectSwarmResult(result) {
    const label = result.label || result.mode;
    let content = "";
    if      (result.mode === "boss-team")       content = `**Swarm — ${label}**\n\n${result.synthesis}\n\n---\n*${result.results.length} workers collaborated.*`;
    else if (result.mode === "all-vote")        content = `**Swarm — ${label}**\n\n${result.verdict}\n\n---\n*${result.votes.length} models voted.*`;
    else if (result.mode === "chain-refine")    content = `**Swarm — ${label}**\n\n${result.final}\n\n---\n*Refined through ${result.history.length} steps.*`;
    else if (result.mode === "devils-advocate") content = `**Swarm — ${label}**\n\n${result.resolution}\n\n---\n*Proposal challenged and resolved.*`;
    if (typeof state !== "undefined") {
      state.messages.push({ role: "assistant", content, id: Date.now().toString(36), ts: Date.now() });
      if (typeof render === "function") render();
      if (typeof persistCurrentChat === "function") persistCurrentChat();
    }
  }

  async function runSwarm(mode, task, models) {
    if (!task?.trim()) { alert("Enter a task first."); return; }
    if (!models?.length) { alert("Select at least one model."); return; }
    SwarmState.log = [];
    renderSwarmLog();

    if (swarmAbort) swarmAbort.abort();
    swarmAbort = new AbortController();
    const signal = swarmAbort.signal;

    const termBtn = document.getElementById("cv-swarm-terminate");
    if (termBtn) termBtn.classList.add("visible");

    let result;
    try {
      if      (mode === "boss-team")       result = await runBossTeam(task, models, signal);
      else if (mode === "all-vote")        result = await runAllVote(task, models, signal);
      else if (mode === "chain-refine")    result = await runChainRefine(task, models, signal);
      else if (mode === "devils-advocate") result = await runDevilsAdvocate(task, models, signal);
      else return;
    } catch (err) {
      if (err.name === "AbortError") swarmLog("System", "Swarm stopped by user.", "err");
      else swarmLog("Error", err.message, "err");
      return;
    } finally {
      swarmAbort = null;
      if (termBtn) termBtn.classList.remove("visible");
    }

    showSwarmResult(result);
    injectSwarmResult(result);
  }

  function abortSwarm() {
    if (swarmAbort) swarmAbort.abort();
  }

  function abortWorkflow() {
    if (workflowAbort) workflowAbort.abort();
  }

  return {
    ollamaChat,
    runSwarm,
    SwarmState,
    abortSwarm,
    abortWorkflow,
    renderSwarmLog,
    swarmLog,
  };
}
