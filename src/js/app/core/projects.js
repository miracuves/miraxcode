import { state } from './state.js';

/**
 * Projects / workspaces + agent run trace persistence.
 */
export function createProjectsApi(deps) {
  const {
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
    getSavedCurrentProjectId,
    projectSelect,
    modelEl,
    inputEl,
    wire = {},
  } = deps;

  function normalizeProject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    if (!id || !name) return null;
    return {
      id,
      name: name.slice(0, 80),
      instructions: String(raw.instructions || '').slice(0, 4000),
      memoryMode: raw.memoryMode === 'project' ? 'project' : 'default',
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now(),
    };
  }

  function loadProjects() {
    let projects = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      if (Array.isArray(parsed)) projects = parsed.map(normalizeProject).filter(Boolean);
    } catch {}
    if (!projects.some((p) => p.id === DEFAULT_PROJECT_ID)) projects.unshift({ ...DEFAULT_PROJECT });
    state.projects = projects;
    const savedId = getSavedCurrentProjectId?.() || DEFAULT_PROJECT_ID;
    state.currentProjectId = projects.some((p) => p.id === savedId) ? savedId : DEFAULT_PROJECT_ID;
    saveProjects();
  }

  function saveProjects() {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(state.projects)); } catch {}
  }

  function currentProject() {
    return state.projects.find((p) => p.id === state.currentProjectId) || state.projects[0] || DEFAULT_PROJECT;
  }

  function chatProjectId(chat) {
    return chat?.projectId || DEFAULT_PROJECT_ID;
  }

  function chatBelongsToCurrentProject(chat) {
    return chatProjectId(chat) === state.currentProjectId;
  }

  function renderProjectSelect() {
    if (!projectSelect) return;
    projectSelect.innerHTML = state.projects.map((p) =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`
    ).join('');
    projectSelect.value = state.currentProjectId;
    projectSelect.title = `Project: ${currentProject().name}`;
  }

  function switchProject(id) {
    if (!id || id === state.currentProjectId || !state.projects.some((p) => p.id === id)) return;
    wire.persistCurrentChat?.();
    state.currentProjectId = id;
    state.messages = [];
    state.currentChatId = null;
    state.pendingImages = [];
    state.pendingFiles = [];
    state.replyTo = null;
    state.editing = null;
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }
    wire.renderPending?.();
    wire.setActiveTitle?.('New Conversation');
    if (modelEl) wire.setActiveSub?.(modelEl.value);
    wire.saveSettings?.();
    renderProjectSelect();
    wire.renderChatList?.();
    wire.render?.();
  }

  async function createProject() {
    const name = await themedPrompt('Project name:', '', 'New Project');
    if (!name || !name.trim()) return;
    const record = {
      ...DEFAULT_PROJECT,
      id: 'project_' + uid(),
      name: name.trim().slice(0, 80),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.projects.unshift(record);
    saveProjects();
    renderProjectSelect();
    switchProject(record.id);
  }

  async function renameProject() {
    const proj = currentProject();
    const name = await themedPrompt('Rename project:', proj.name, 'Rename Project');
    if (!name || !name.trim() || name.trim() === proj.name) return;
    proj.name = name.trim().slice(0, 80);
    proj.updatedAt = Date.now();
    saveProjects();
    renderProjectSelect();
  }

  async function deleteProject() {
    const proj = currentProject();
    if (proj.id === DEFAULT_PROJECT_ID) {
      await themedAlert('The Personal project cannot be deleted.', 'Delete Project');
      return;
    }
    const ok = await themedConfirm(`Delete "${proj.name}"? Its chats will move to Personal.`, 'Delete Project');
    if (!ok) return;
    state.chats.forEach((c) => {
      if ((c.projectId || DEFAULT_PROJECT_ID) === proj.id) c.projectId = DEFAULT_PROJECT_ID;
    });
    saveChats();
    state.projects = state.projects.filter((p) => p.id !== proj.id);
    saveProjects();
    state.currentProjectId = DEFAULT_PROJECT_ID;
    renderProjectSelect();
    switchProject(DEFAULT_PROJECT_ID);
  }

  function projectScopedItems(items) {
    return (items || []).filter((it) => (it.projectId || DEFAULT_PROJECT_ID) === state.currentProjectId);
  }

  function loadAgentRuns() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AGENT_RUNS_KEY) || '[]');
      state.agentRuns = Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === 'object') : [];
    } catch { state.agentRuns = []; }
  }

  function saveAgentRuns() {
    try { localStorage.setItem(AGENT_RUNS_KEY, JSON.stringify(state.agentRuns.slice(0, 250))); } catch {}
  }

  function beginAgentRun(agent, userText) {
    return {
      id: 'run_' + uid(),
      projectId: state.currentProjectId,
      chatId: state.currentChatId || null,
      agentId: agent?.id || null,
      agentName: agent?.name || 'Agent',
      model: modelEl?.value,
      userText: String(userText || '').slice(0, 500),
      events: [],
      startedAt: Date.now(),
      completedAt: null,
    };
  }

  function recordAgentEvent(assistant, type, label, data = null) {
    if (!assistant) return;
    if (!assistant.runEvents) assistant.runEvents = [];
    assistant.runEvents.push({ ts: Date.now(), type, label: String(label || ''), data });
  }

  function finishAgentRun(assistant) {
    if (!assistant?.runTrace) return;
    const run = assistant.runTrace;
    run.events = assistant.runEvents || [];
    run.completedAt = Date.now();
    run.durationMs = run.completedAt - run.startedAt;
    run.finalChars = (assistant.content || '').length;
    state.agentRuns.unshift(run);
    state.activeRunId = run.id;
    saveAgentRuns();
  }

  return {
    normalizeProject,
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
  };
}
