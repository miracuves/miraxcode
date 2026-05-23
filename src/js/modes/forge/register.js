export function registerForgeMode() {
  (window._registeredModes = window._registeredModes || {})['forge'] = {
    label: '3D Forge',
    bodyClass: 'forge-studio-mode',
    appClass: null,
    fullscreen: true,
    btnId: 'tabForge',
    mount: () => window.ForgeMode?.mount?.(),
    destroy: () => window.ForgeMode?.destroy?.(),
  };
}
