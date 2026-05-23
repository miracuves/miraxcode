import { createCoderMode } from './coder-mode.js';
import { createLegacyBridge } from './legacy-bridge.js';
import { registerCodeMode, scheduleCoderBoot, initSharedDom } from './register.js';
import { relativeFromRoot as relFromRoot } from './dom-utils.js';

export function installCodeMode() {
  const sharedState = { projectRoot: null, activeFile: null, homeDir: null, pendingStaged: [] };
  const modelRef = { current: null };

  function relativeFromRoot(path) {
    return relFromRoot(path, sharedState.projectRoot);
  }

  const CoderMode = createCoderMode({ sharedState, modelRef, relativeFromRoot });
  const { legacyRun } = createLegacyBridge(sharedState);
  registerCodeMode({ CoderMode, legacyRun, sharedState });
  scheduleCoderBoot(initSharedDom);
}
