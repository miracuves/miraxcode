export function registerAgentMakerMode() {
  (window._registeredModes = window._registeredModes || {})['agent-maker'] = {
    label: 'Swarm',
    bodyClass: 'agent-maker-mode',
    appClass: null,
    fullscreen: true,
    btnId: 'tabAgentMaker',
    mount: () => window.SwarmMaker?.mount?.(),
    destroy: () => {},
  };
}
