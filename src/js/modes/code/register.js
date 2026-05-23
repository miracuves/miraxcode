import { injectAllToolBlocks } from './tool-blocks.js';

export function initSharedDom() {
  const auditClose = document.getElementById('hcAuditClose');
  const auditModal = document.getElementById('hcAuditModal');
  if (auditClose) auditClose.addEventListener('click', () => auditModal?.classList.remove('open'));
  if (auditModal) auditModal.addEventListener('click', e => { if (e.target === auditModal) auditModal.classList.remove('open'); });
}

export function scheduleCoderBoot(initSharedDomFn) {
  function init() {
    if (!window._H) { setTimeout(init, 150); return; }
    initSharedDomFn();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

export function registerCodeMode({ CoderMode, legacyRun, sharedState }) {
  window.CoderMode = CoderMode;

  (window._registeredModes = window._registeredModes || {})['code'] = {
    label:     'Coder',
    bodyClass: 'coder-mode',
    appClass:  null,
    fullscreen: true,
    btnId:     'tabCode',
    mount:     () => { window.CoderMode?.mount?.(); window.CoderMode?.remount?.(); },
    destroy:   () => window.CoderMode?.destroy?.(),
  };

  window.HC_CODE = {
    run: legacyRun,
    pickProject: async () => {
      if (!window.HC?.isTauri) return;
      try {
        const folder = await HC.invoke('plugin:dialog|open', { directory: true, multiple: false, title: 'Open Project Folder' }).catch(() => null);
        if (folder && typeof folder === 'string') sharedState.projectRoot = folder;
      } catch {}
    },
    showAuditLog: async () => {
      const modal = document.getElementById('hcAuditModal');
      if (modal) modal.classList.add('open');
    },
    afterRender: injectAllToolBlocks,
    get state() { return sharedState; },
  };
}
