import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('HcStorage trims chat list and messages', () => {
  const storage = {};
  const localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  };
  const ctx = {
    localStorage,
    console,
    Blob: class Blob {
      constructor(parts) { this.size = parts.join('').length; }
    },
    window: { HC: { guard: { notify: () => {} } } },
  };
  vm.createContext(ctx);
  const path = join(dirname(fileURLToPath(import.meta.url)), '../src/js/hc-storage.js');
  vm.runInContext(readFileSync(path, 'utf8'), ctx);

  const { HcStorage } = ctx.window;
  assert.ok(HcStorage);

  const huge = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    messages: Array.from({ length: 150 }, () => ({
      role: 'user',
      content: 'x'.repeat(30_000),
    })),
  }));

  const trimmed = HcStorage.trimChatList(huge);
  assert.equal(trimmed.length, 80);
  assert.equal(trimmed[0].messages.length, 100);
  assert.ok(trimmed[0].messages[0].content.length <= 24_000 + 40);
});
