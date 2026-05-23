// mode-loader.js — lazy-load heavy mode scripts on first tab open
(function () {
  'use strict';

  const MODE_SCRIPTS = {
    finance: '/js/finance.bundle.js',
    sandbox: '/js/sandbox.bundle.js',
    'agent-maker': '/js/agent-maker.bundle.js',
    systems: '/js/systems.bundle.js',
    forge: '/js/forge.bundle.js',
    'virtual-os': '/js/virtual-os.bundle.js',
  };

  const inflight = Object.create(null);

  function ensureModeScript(tab) {
    const src = MODE_SCRIPTS[tab];
    if (!src) return Promise.resolve();
    if (inflight[src]) return inflight[src];
    if (document.querySelector(`script[data-mx-lazy="${src}"]`)) {
      return Promise.resolve();
    }
    inflight[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.dataset.mxLazy = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(el);
    });
    return inflight[src];
  }

  window.ensureModeScript = ensureModeScript;
})();
