export function registerSandboxMode() {
  (window._registeredModes = window._registeredModes || {})['sandbox'] = {
    label: 'Sandbox',
    bodyClass: null,
    appClass: 'sandbox-mode',
    fullscreen: true,
    btnId: 'tabSandbox',
    mount: () => window.SandboxMode?.mount?.(),
    destroy: () => {},
  };
}
