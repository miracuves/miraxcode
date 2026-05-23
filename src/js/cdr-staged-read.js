// cdr-staged-read.js — read_file sees pending staged content (policy B)
(function () {
  'use strict';

  const staged = new Map();

  function syncFromChanges(fileChanges) {
    staged.clear();
    for (const fc of fileChanges || []) {
      if (fc?.status === 'pending' && fc.path) {
        staged.set(fc.path, String(fc.proposedContent ?? fc.content ?? ''));
      }
    }
  }

  function get(path) {
    return staged.has(path) ? staged.get(path) : null;
  }

  function clearPath(path) {
    staged.delete(path);
  }

  window.CdrStagedRead = { syncFromChanges, get, clearPath, _map: staged };
})();
