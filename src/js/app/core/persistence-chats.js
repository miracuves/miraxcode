import { state } from './state.js';

export function loadChats() {
  const Hs = window.HcStorage;
  const loadBucket = (key) => {
    const arr = Hs?.getJSON?.(key, []) ?? [];
    return Array.isArray(arr) ? arr.filter((c) => c && typeof c === 'object') : [];
  };
  state.chats = loadBucket('atelier_chats');
  state.codeChats = loadBucket('atelier_code_chats');
  state.forgeChats = loadBucket('atelier_forge_chats');
}

export function saveChats() {
  const Hs = window.HcStorage;
  if (Hs?.setJSON) {
    Hs.setJSON('atelier_chats', state.chats, { kind: 'chats', maxBytes: Hs.LIMITS?.MAX_CHAT_JSON_BYTES });
    return;
  }
  try { localStorage.setItem('atelier_chats', JSON.stringify(state.chats)); } catch {}
}

export function saveCodeChats() {
  const Hs = window.HcStorage;
  if (Hs?.setJSON) {
    Hs.setJSON('atelier_code_chats', state.codeChats, { kind: 'chats', maxBytes: Hs.LIMITS?.MAX_CHAT_JSON_BYTES });
    return;
  }
  try { localStorage.setItem('atelier_code_chats', JSON.stringify(state.codeChats)); } catch {}
}

export function saveForgeChats() {
  const Hs = window.HcStorage;
  if (Hs?.setJSON) {
    Hs.setJSON('atelier_forge_chats', state.forgeChats, { kind: 'chats', maxBytes: Hs.LIMITS?.MAX_CHAT_JSON_BYTES });
    return;
  }
  try { localStorage.setItem('atelier_forge_chats', JSON.stringify(state.forgeChats)); } catch {}
}
