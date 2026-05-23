/**
 * MiraXCode — production-safe localStorage layer.
 * Caps chat/history size, detects quota exhaustion, surfaces errors to the user.
 */
(function () {
  'use strict';

  const LIMITS = {
    MAX_CHATS: 80,
    MAX_MSGS_PER_CHAT: 100,
    MAX_MSG_CHARS: 24_000,
    MAX_CHAT_JSON_BYTES: 2_000_000,
    MAX_GENERIC_JSON_BYTES: 1_500_000,
  };

  function notify(msg, kind) {
    try {
      window.HC?.guard?.notify?.(msg, kind || 'warn');
    } catch {}
    console.warn('[HcStorage]', msg);
  }

  function isQuotaError(err) {
    const name = err?.name || '';
    const code = err?.code;
    return name === 'QuotaExceededError' || code === 22 || code === 1014;
  }

  function byteLength(str) {
    try {
      return new Blob([str]).size;
    } catch {
      return str.length * 2;
    }
  }

  function trimMessage(m) {
    if (!m || typeof m !== 'object') return m;
    const out = { ...m };
    if (typeof out.content === 'string' && out.content.length > LIMITS.MAX_MSG_CHARS) {
      out.content = out.content.slice(0, LIMITS.MAX_MSG_CHARS) + '\n… (truncated for storage)';
    }
    if (Array.isArray(out.images)) out.images = out.images.slice(0, 8);
    return out;
  }

  function trimChatForStorage(chat) {
    if (!chat || typeof chat !== 'object') return chat;
    const messages = (Array.isArray(chat.messages) ? chat.messages : [])
      .slice(-LIMITS.MAX_MSGS_PER_CHAT)
      .map(trimMessage);
    return { ...chat, messages };
  }

  function trimChatList(chats) {
    if (!Array.isArray(chats)) return [];
    return chats.slice(0, LIMITS.MAX_CHATS).map(trimChatForStorage);
  }

  function fitJsonSize(value, maxBytes, shrink) {
    let data = value;
    let json = JSON.stringify(data);
    let guard = 0;
    while (byteLength(json) > maxBytes && guard++ < 200) {
      const next = shrink(data, guard);
      if (!next || next === data) break;
      data = next;
      json = JSON.stringify(data);
    }
    return { data, json };
  }

  function shrinkChats(chats, pass) {
    if (!Array.isArray(chats) || !chats.length) return chats;
    if (pass < 40) return chats.slice(0, Math.max(1, chats.length - 1));
    const trimmed = chats.map((c, i) =>
      i < 5 ? c : trimChatForStorage({ ...c, messages: (c.messages || []).slice(-Math.max(10, 60 - pass)) })
    );
    return trimmed.slice(0, Math.max(10, LIMITS.MAX_CHATS - Math.floor(pass / 4)));
  }

  function getJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (e) {
      console.warn('[HcStorage] corrupt JSON for', key, e);
      return fallback;
    }
  }

  function setJSON(key, value, opts = {}) {
    const maxBytes = opts.maxBytes ?? LIMITS.MAX_GENERIC_JSON_BYTES;
    const kind = opts.kind || 'generic';
    let payload = value;

    if (kind === 'chats') {
      payload = trimChatList(Array.isArray(value) ? value : []);
      const fitted = fitJsonSize(payload, maxBytes, shrinkChats);
      payload = fitted.data;
    }

    let json = JSON.stringify(payload);
    if (byteLength(json) > maxBytes && kind === 'chats') {
      const fitted = fitJsonSize(payload, maxBytes, shrinkChats);
      payload = fitted.data;
      json = fitted.json;
      notify('Chat history was trimmed to fit device storage limits.', 'info');
    }

    try {
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      if (!isQuotaError(e)) {
        console.error('[HcStorage] set failed', key, e);
        notify('Could not save data: ' + (e?.message || String(e)), 'err');
        return false;
      }
      if (kind === 'chats' && Array.isArray(payload)) {
        const fitted = fitJsonSize(payload, Math.floor(maxBytes * 0.85), shrinkChats);
        try {
          localStorage.setItem(key, fitted.json);
          notify('Storage almost full — older chats were removed automatically.', 'warn');
          return true;
        } catch (e2) {
          notify('Storage full. Export important chats, then clear old history in Settings.', 'err');
          console.error('[HcStorage] quota exceeded', key, e2);
          return false;
        }
      }
      notify('Storage full. Free disk space or clear chat history.', 'err');
      return false;
    }
  }

  window.HcStorage = {
    LIMITS,
    getJSON,
    setJSON,
    trimChatList,
    trimChatForStorage,
    trimMessage,
  };
})();
