import {
  LOOK_2026,
  HASH_AI_PROMPT,
  FULLSTACK_PROMPT,
  PRESET_PROMPTS,
  FORGE_ARCHITECT_PROMPT,
} from './presets.js';

import { createMessagesRenderApi } from './render.js';
import { createMessagesTurnApi } from './turn.js';

export function createMessagesApi(deps) {
  const renderApi = createMessagesRenderApi(deps);
  const turnApi = createMessagesTurnApi(deps, renderApi);
  return { ...renderApi, ...turnApi };
}
