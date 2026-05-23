export function registerVirtualOsMode() {
  (window._registeredModes = window._registeredModes || {})['virtual-os'] = {
    label: 'Virtual OS',
    bodyClass: 'virtual-os-mode',
    appClass: null,
    fullscreen: true,
    btnId: 'tabVirtualOS',
    mount: () => window.VoidStudio?.mount?.(),
    destroy: () => window.VoidStudio?.destroy?.(),
  };
}
