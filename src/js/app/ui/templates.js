/**
 * Prompt template library — load/save, editor modal, fill {{vars}}, insert into composer.
 */

/**
 * @param {object} deps
 */
export function createTemplatesApi(deps) {
  const {
    state,
    uid,
    escapeHtml,
    $,
    themedPrompt,
    templateOverlay,
    templateListEl,
    templateNameEl,
    templateBodyEl,
  } = deps;

  function loadTemplates() {
    try {
      const raw = localStorage.getItem('hashui_templates');
      const parsed = raw ? JSON.parse(raw) : [];
      state.templates = Array.isArray(parsed) ? parsed.filter((t) => t && typeof t === 'object') : [];
    } catch {
      state.templates = [];
    }
    if (!state.templates.length) {
      state.templates = [
        { id: uid(), name: 'Translate', body: 'Translate this to {{language}}:\n\n{{text}}' },
        { id: uid(), name: 'Summarize File', body: 'Summarize the attached content for {{audience}}. Focus on {{focus}}.' },
      ];
      saveTemplates();
    }
    state.activeTemplateId = state.templates[0]?.id || null;
  }

  function saveTemplates() {
    try {
      localStorage.setItem('hashui_templates', JSON.stringify(state.templates));
    } catch {}
  }

  function templateVars(body) {
    return [
      ...new Set(
        (String(body || '').match(/{{\s*[\w.-]+\s*}}/g) || [])
          .map((v) => v.replace(/[{}]/g, '').trim())
          .filter(Boolean),
      ),
    ];
  }

  function activeTemplate() {
    return state.templates.find((t) => t.id === state.activeTemplateId) || state.templates[0] || null;
  }

  function renderTemplates() {
    if (!templateListEl) return;
    templateListEl.innerHTML = '';
    state.templates.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'template-item' + (t.id === state.activeTemplateId ? ' active' : '');
      const vars = templateVars(t.body);
      b.innerHTML = `<div class="template-title">${escapeHtml(t.name || 'Untitled')}</div><div class="template-vars">${vars.length ? vars.map((v) => '{{' + escapeHtml(v) + '}}').join(' ') : 'no variables'}</div>`;
      b.addEventListener('click', () => {
        state.activeTemplateId = t.id;
        templateNameEl.value = t.name || '';
        templateBodyEl.value = t.body || '';
        renderTemplates();
      });
      templateListEl.appendChild(b);
    });
    const t = activeTemplate();
    if (t && !templateNameEl.value && !templateBodyEl.value) {
      templateNameEl.value = t.name || '';
      templateBodyEl.value = t.body || '';
    }
  }

  function openTemplates() {
    loadTemplates();
    renderTemplates();
    templateOverlay.classList.add('open');
    templateNameEl.focus();
  }

  function closeTemplates() {
    templateOverlay.classList.remove('open');
  }

  async function fillTemplate(t) {
    if (!t) return '';
    let body = t.body || '';
    for (const key of templateVars(body)) {
      const val = await themedPrompt(key, '', 'Template');
      if (val === null) return '';
      body = body.replace(
        new RegExp(`{{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*}}`, 'g'),
        val,
      );
    }
    return body;
  }

  function insertAtComposer(text, replace = false, input) {
    if (!text || !input) return;
    if (replace) input.value = text;
    else input.value = input.value ? `${input.value.trimEnd()}\n\n${text}` : text;
    input.dispatchEvent(new Event('input'));
    input.focus();
  }

  function wireTemplateEvents(input) {
    loadTemplates();
    $('templateClose')?.addEventListener('click', closeTemplates);
    templateOverlay?.addEventListener('click', (e) => {
      if (e.target === templateOverlay) closeTemplates();
    });
    $('templateNew')?.addEventListener('click', () => {
      const t = { id: uid(), name: 'New Template', body: '' };
      state.templates.unshift(t);
      state.activeTemplateId = t.id;
      templateNameEl.value = t.name;
      templateBodyEl.value = '';
      saveTemplates();
      renderTemplates();
      templateBodyEl.focus();
    });
    $('templateSave')?.addEventListener('click', () => {
      let t = activeTemplate();
      if (!t) {
        t = { id: uid(), name: '', body: '' };
        state.templates.unshift(t);
        state.activeTemplateId = t.id;
      }
      t.name = templateNameEl.value.trim() || 'Untitled';
      t.body = templateBodyEl.value;
      saveTemplates();
      renderTemplates();
    });
    $('templateDelete')?.addEventListener('click', () => {
      const t = activeTemplate();
      if (!t) return;
      state.templates = state.templates.filter((x) => x.id !== t.id);
      state.activeTemplateId = state.templates[0]?.id || null;
      saveTemplates();
      templateNameEl.value = activeTemplate()?.name || '';
      templateBodyEl.value = activeTemplate()?.body || '';
      renderTemplates();
    });
    $('templateUse')?.addEventListener('click', async () => {
      const t = activeTemplate();
      const text = await fillTemplate(t);
      if (text) {
        insertAtComposer(text, false, input);
        closeTemplates();
      }
    });
  }

  return {
    loadTemplates,
    saveTemplates,
    templateVars,
    activeTemplate,
    renderTemplates,
    openTemplates,
    closeTemplates,
    fillTemplate,
    insertAtComposer,
    wireTemplateEvents,
  };
}
