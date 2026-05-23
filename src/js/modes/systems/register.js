export function registerSystemsMode() {
  (window._registeredModes = window._registeredModes || {})['systems'] = {
    label: 'Systems',
    bodyClass: 'system-maker-mode',
    appClass: 'system-maker-mode',
    fullscreen: true,
    btnId: 'tabSystems',
    mount: () => window.SystemMaker?.mount?.(),
    destroy: () => {},
  };
}
