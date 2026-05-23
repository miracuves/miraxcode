/**
 * Agents sidebar: Knowledge Base card, agent list, active chip, editor modal.
 */

import { RAG_KEY } from '../features/rag.js';

const ICON_OPTIONS = [
  '⚙︎', '✦', '✎', '{ }',
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2.5-2.5 4-2.5 6s.5 3.5 2.5 6M8 2c2 2.5 2.5 4 2.5 6s-.5 3.5-2.5 6"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 10.5a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24L6.5 5.5"/><path d="M10.5 5.5a3 3 0 00-4.24 0l-2 2a3 3 0 004.24 4.24l1-1"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><polyline points="10,2 6,8.5 9.5,8.5 6,14"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="12" rx="0.5"/><rect x="9" y="3" width="5" height="11" rx="0.5"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><circle cx="8" cy="11" r="1.5"/><path d="M5 6.5v2.5c0 .8.7 1.5 1.5 1.5H8M11 6.5v2.5c0 .8-.7 1.5-1.5 1.5H8"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2a3.5 3.5 0 00-3.5 4.5L2.5 13a1.5 1.5 0 002 2L11 8.5A3.5 3.5 0 1011.5 2z"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M4 6h8M4 9h5"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="6" r="2.5"/><path d="M3 14a5 5 0 0110 0"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6l-1.4 1.4M5 11l-1.4 1.4"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="2" y="2" width="12" height="10" rx="1.5"/><path d="M2 10l4-3 3 2 2-2 3 3"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h10a1 1 0 011 1v6a1 1 0 01-1 1H3l-2-2v-4l2-2z"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M8 5v6M5 8h6"/></svg>`,
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13V8a4 4 0 118 0v5"/><path d="M1 13h14"/></svg>`,
];

/**
 * @param {object} deps
 */
export function createAgentsPanelApi(deps) {
  const {
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
    getRagEnabled,
    setRagEnabled,
  } = deps;

  let editingAgent = null;

  function agentIconSvg(agent) {
    const id = agent?.id || '';
    const tools = new Set(agent?.tools || []);
    let paths;
    if (id === 'builtin_hash_ai') {
      paths = `<path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>`;
    } else if (id === 'builtin_coder') {
      paths = `<polyline points="8 9 4 12 8 15"/><polyline points="16 9 20 12 16 15"/><path d="M14 5l-4 14"/>`;
    } else if (id === 'builtin_medical_lexi') {
      paths = `<path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M12 3v5h5"/><path d="M9 13h6"/><path d="M12 10v6"/>`;
    } else if (id === 'builtin_ats_auditor') {
      paths = `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/><circle cx="17" cy="17" r="3"/><path d="m19.5 19.5 1.5 1.5"/>`;
    } else if (tools.has('web_search') || tools.has('wikipedia')) {
      paths = `<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/><path d="M8.5 11h5"/><path d="M11 8.5v5"/>`;
    } else if (tools.has('fetch_url')) {
      paths = `<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>`;
    } else if (tools.has('pubmed')) {
      paths = `<path d="M5 4h10a4 4 0 0 1 0 8H5Z"/><path d="M5 12h11a3 3 0 0 1 0 6H5Z"/><path d="M8 7h5"/><path d="M8 15h6"/>`;
    } else {
      paths = `<circle cx="12" cy="8" r="3"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M18 4l2 2"/><path d="M4 6l2-2"/>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  function renderActiveAgentChip() {
    const agent = allAgents().find((a) => a.id === state.activeAgentId) || null;
    if (!agent) {
      activeAgentChip.hidden = true;
      activeAgentChip.className = '';
      activeAgentChip.removeAttribute('title');
      activeAgentChip.innerHTML = '';
      activeAgentChip.onclick = null;
      return;
    }
    activeAgentChip.hidden = false;
    activeAgentChip.style.display = '';
    activeAgentChip.className = 'agent-chip';
    activeAgentChip.title = `Active agent: ${agent.name}`;
    activeAgentChip.innerHTML = `<span class="ico">${agentIconSvg(agent)}</span><span class="agent-chip-name">${escapeHtml(agent.name)}</span><span class="clear agent-chip-clear" title="Deactivate agent">×</span>`;
    activeAgentChip.querySelector('.clear').addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveAgent(null);
    });
    activeAgentChip.onclick = () => { setTab('agents'); };
  }

  function setActiveAgent(id) {
    state.activeAgentId = id;
    saveSettings();
    renderActiveAgentChip();
    renderAgentsList();
  }

  function renderAgentsList() {
    agentsListEl.innerHTML = '';

    const macCount = loadRAG().length;
    const kb = document.createElement('div');
    kb.className = 'kb-card';
    kb.innerHTML = `
      <span class="kb-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <ellipse cx="12" cy="5" rx="7" ry="3"/>
          <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/>
          <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>
          <path d="M8.5 15.5h7"/>
        </svg>
      </span>
      <div class="kb-body">
        <div class="kb-title">Knowledge Base</div>
        <div class="kb-stats">
          <span>This PC: <b id="ragCount">${macCount}</b></span>
          <span style="color:var(--line-strong)">·</span>
          <span>Local PC: <b id="ragDellCount">—</b></span>
          <button class="kb-clear" id="ragClearBtn">Clear This PC</button>
          <button class="kb-clear" id="ragDellClearBtn" style="display:none">Clear Local PC</button>
        </div>
      </div>
      <div class="rag-toggle${getRagEnabled() ? ' on' : ''}" id="ragToggle" title="Enable/disable knowledge base"></div>`;
    kb.querySelector('#ragToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      setRagEnabled(!getRagEnabled());
      e.currentTarget.classList.toggle('on', getRagEnabled());
      saveSettings();
    });
    kb.querySelector('#ragClearBtn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await themedConfirm('Clear all This PC knowledge chunks?', 'Knowledge Base')) return;
      localStorage.removeItem(RAG_KEY);
      updateRagCount();
    });
    kb.querySelector('#ragDellClearBtn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!await themedConfirm('Clear Local PC knowledge base?', 'Knowledge Base')) return;
      await ragDellClear();
    });
    agentsListEl.appendChild(kb);
    ragDellStats().then((s) => {
      const dc = document.getElementById('ragDellCount');
      const db = document.getElementById('ragDellClearBtn');
      if (dc && s !== null) {
        dc.textContent = s.count;
        if (db && s.count > 0) db.style.display = '';
      }
    }).catch(() => {});

    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:rgba(255,255,255,0.05);margin:2px 0 4px';
    agentsListEl.appendChild(sep);

    const list = allAgents();
    list.forEach((agent) => {
      const row = document.createElement('div');
      row.className = 'agent-item' + (agent.id === state.activeAgentId ? ' active' : '');
      const toolsHtml = (agent.tools && agent.tools.length)
        ? `<div class="agent-tools">${agent.tools.map((t) => `<span class="agent-tool">${escapeHtml(t.replace('_', ' '))}</span>`).join('')}</div>`
        : '';
      const editBtn = !agent.builtin
        ? `<button class="edit-agent" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
           <button class="del-agent" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg></button>`
        : `<button class="edit-agent" title="Duplicate & edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
      row.innerHTML = `
        <div class="agent-icon">${agentIconSvg(agent)}</div>
        <div class="agent-meta">
          <div class="agent-name">${escapeHtml(agent.name)}</div>
          <div class="agent-desc">${escapeHtml(agent.description || '')}</div>
          ${toolsHtml}
        </div>
        <div class="agent-actions">${editBtn}</div>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.edit-agent') || e.target.closest('.del-agent')) return;
        setActiveAgent(agent.id === state.activeAgentId ? null : agent.id);
      });
      const editEl = row.querySelector('.edit-agent');
      if (editEl) editEl.addEventListener('click', (e) => { e.stopPropagation(); openAgentEditor(agent); });
      const delEl = row.querySelector('.del-agent');
      if (delEl) delEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await themedConfirm(`Delete agent "${agent.name}"?`, 'Delete Agent')) return;
        state.agents = state.agents.filter((a) => a.id !== agent.id);
        if (state.activeAgentId === agent.id) state.activeAgentId = null;
        saveAgents();
        saveSettings();
        renderAgentsList();
        renderActiveAgentChip();
      });
      agentsListEl.appendChild(row);
    });
  }

  function renderIconPicker() {
    const picker = $('iconPicker');
    picker.innerHTML = '';
    ICON_OPTIONS.forEach((ic) => {
      const b = document.createElement('button');
      b.innerHTML = ic;
      b.className = ic === editingAgent.icon ? 'selected' : '';
      b.addEventListener('click', () => { editingAgent.icon = ic; renderIconPicker(); });
      picker.appendChild(b);
    });
  }

  function openAgentEditor(source) {
    if (!source) {
      editingAgent = { id: null, icon: '✦', name: '', description: '', systemPrompt: '', tools: [] };
      $('agentTitle').textContent = 'New agent';
      $('deleteAgentBtn').style.display = 'none';
    } else if (source.builtin) {
      editingAgent = {
        id: null,
        icon: source.icon,
        name: source.name + ' (copy)',
        description: source.description,
        systemPrompt: source.systemPrompt,
        tools: [...(source.tools || [])],
      };
      $('agentTitle').textContent = 'Duplicate agent';
      $('deleteAgentBtn').style.display = 'none';
    } else {
      editingAgent = JSON.parse(JSON.stringify(source));
      $('agentTitle').textContent = 'Edit agent';
      $('deleteAgentBtn').style.display = '';
    }
    $('agentName').value = editingAgent.name;
    $('agentDesc').value = editingAgent.description;
    $('agentSystem').value = editingAgent.systemPrompt;
    $('toolWiki').checked = editingAgent.tools.includes('wikipedia');
    $('toolWebSearch').checked = editingAgent.tools.includes('web_search');
    $('toolFetchUrl').checked = editingAgent.tools.includes('fetch_url');
    $('toolPubmed').checked = editingAgent.tools.includes('pubmed');
    $('toolMemory').checked = editingAgent.tools.includes('memory');
    $('toolDatetime').checked = editingAgent.tools.includes('datetime');
    $('toolCalc').checked = editingAgent.tools.includes('calculate');
    $('toolPython').checked = editingAgent.tools.includes('code_interpreter');
    renderIconPicker();
    agentOverlay.classList.add('open');
  }

  async function saveAgentFromEditor() {
    const name = $('agentName').value.trim();
    if (!name) {
      await themedAlert('Give your agent a name.', 'Agent Required');
      return;
    }
    const tools = [];
    if ($('toolWiki').checked) tools.push('wikipedia');
    if ($('toolWebSearch').checked) tools.push('web_search');
    if ($('toolFetchUrl').checked) tools.push('fetch_url');
    if ($('toolPubmed').checked) tools.push('pubmed');
    if ($('toolMemory').checked) tools.push('memory');
    if ($('toolDatetime').checked) tools.push('datetime');
    if ($('toolCalc').checked) tools.push('calculate');
    if ($('toolPython').checked) tools.push('code_interpreter');
    const record = {
      id: editingAgent.id || ('agent_' + uid()),
      builtin: false,
      icon: editingAgent.icon || '✦',
      name,
      description: $('agentDesc').value.trim(),
      systemPrompt: $('agentSystem').value.trim(),
      tools,
    };
    if (editingAgent.id) {
      state.agents = state.agents.map((a) => (a.id === record.id ? record : a));
    } else {
      state.agents.unshift(record);
    }
    saveAgents();
    editingAgent = null;
    agentOverlay.classList.remove('open');
    renderAgentsList();
    renderActiveAgentChip();
  }

  async function deleteAgentFromEditor() {
    if (!editingAgent?.id) return;
    if (!await themedConfirm('Delete this agent?', 'Delete Agent')) return;
    state.agents = state.agents.filter((a) => a.id !== editingAgent.id);
    if (state.activeAgentId === editingAgent.id) state.activeAgentId = null;
    saveAgents();
    saveSettings();
    editingAgent = null;
    agentOverlay.classList.remove('open');
    renderAgentsList();
    renderActiveAgentChip();
  }

  function wireAgentEditorEvents() {
    $('closeAgent').addEventListener('click', () => agentOverlay.classList.remove('open'));
    $('cancelAgentBtn').addEventListener('click', () => agentOverlay.classList.remove('open'));
    $('saveAgentBtn').addEventListener('click', saveAgentFromEditor);
    $('deleteAgentBtn').addEventListener('click', deleteAgentFromEditor);
    agentOverlay.addEventListener('click', (e) => {
      if (e.target === agentOverlay) agentOverlay.classList.remove('open');
    });
  }

  return {
    renderAgentsList,
    renderActiveAgentChip,
    setActiveAgent,
    openAgentEditor,
    agentIconSvg,
    wireAgentEditorEvents,
  };
}
