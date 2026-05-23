// cdr-file-stage.js — preview-then-apply file changes for Coder Mode
(function () {
  'use strict';

  function norm(s) {
    return String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  async function computeProposed(call, readFile) {
    const path = call.arguments?.path || '';
    if (!path) throw new Error('path is required');

    let previousContent = null;
    try {
      previousContent = await readFile(path);
    } catch {
      previousContent = null;
    }

    if (call.name === 'write_file') {
      const content = call.arguments?.content;
      if (content == null) {
        throw new Error('write_file: content is required and must be a string.');
      }
      return {
        path,
        kind: previousContent == null ? 'create' : 'write',
        previousContent,
        proposedContent: String(content),
        tool: 'write_file',
      };
    }

    if (call.name === 'patch_file') {
      const search = call.arguments?.search || '';
      const replace = call.arguments?.replace;
      if (!search) throw new Error('patch_file: search string is required.');
      if (replace == null) throw new Error('patch_file: replace string is required.');
      const base = previousContent ?? '';
      if (!base) {
        throw new Error(`patch_file failed: "${path}" does not exist. Use write_file to create it instead.`);
      }
      let proposed = null;
      if (base.includes(search)) {
        const occ = base.split(search).length - 1;
        if (occ > 1) {
          throw new Error(`patch_file failed: search string found ${occ} times in "${path}". Add more surrounding lines.`);
        }
        proposed = base.replace(search, replace);
      } else {
        const nb = norm(base);
        const ns = norm(search);
        if (nb.includes(ns)) {
          const occ = nb.split(ns).length - 1;
          if (occ > 1) {
            throw new Error(`patch_file failed: search string found ${occ} times after line-ending normalisation.`);
          }
          proposed = nb.replace(ns, replace);
        }
      }
      if (proposed == null) {
        const preview = base.slice(0, 600);
        throw new Error(
          `patch_file failed: search string not found in "${path}".\nFile begins with:\n${preview}`
        );
      }
      return {
        path,
        kind: 'write',
        previousContent: base,
        proposedContent: proposed,
        tool: 'patch_file',
      };
    }

    throw new Error('Unsupported staged tool: ' + call.name);
  }

  async function applyEntry(entry, writeFile) {
    if (!entry || entry.applied) return { ok: true, skipped: true };
    await writeFile(entry.path, entry.proposedContent ?? entry.content, 'User accepted change');
    entry.applied = true;
    return { ok: true };
  }

  async function revertEntry(entry, writeFile, deleteFile) {
    if (!entry) return { ok: true, skipped: true };
    const path = entry.path;
    if (entry.previousContent == null) {
      if (deleteFile) await deleteFile(path, 'Revert new file');
      else await writeFile(path, '', 'Revert new file');
    } else {
      await writeFile(path, entry.previousContent, 'Revert change');
    }
    entry.applied = false;
    return { ok: true };
  }

  /** Reject or undo: revert if applied, or detect legacy immediate writes on disk. */
  async function rejectEntry(entry, readFile, writeFile, deleteFile) {
    if (!entry) return { ok: true, skipped: true };
    if (entry.applied) {
      return revertEntry(entry, writeFile, deleteFile);
    }
    const proposed = entry.proposedContent ?? entry.content ?? '';
    if (!proposed || !readFile) return { ok: true, skipped: true };
    try {
      const current = await readFile(entry.path);
      if (current === proposed) {
        if (entry.previousContent == null) {
          if (deleteFile) await deleteFile(entry.path, 'Revert new file');
          else await writeFile(entry.path, '', 'Revert new file');
        } else {
          await writeFile(entry.path, entry.previousContent, 'Revert legacy change');
        }
        entry.applied = false;
        return { ok: true, legacy: true };
      }
    } catch {
      /* file missing — nothing on disk */
    }
    return { ok: true, skipped: true };
  }

  function stagedResult(path, bytes) {
    return JSON.stringify({
      ok: true,
      staged: true,
      path,
      bytes,
      message: 'Change staged for review — click Accept to write to disk (YOLO applies immediately).',
    });
  }

  window.CdrFileStage = {
    computeProposed,
    applyEntry,
    revertEntry,
    rejectEntry,
    stagedResult,
  };
})();
