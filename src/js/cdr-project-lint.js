// cdr-project-lint.js — run tsc / cargo check and feed Problems panel
(function () {
  'use strict';

  async function fileExists(path) {
    try {
      await window.HC.code.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  async function runShell(root, cmd, args) {
    if (!window.HC?.invoke) return '';
    const r = await window.HC.invoke('shell_run', {
      command: cmd,
      args,
      cwd: root,
    });
    return `${r?.stdout || ''}\n${r?.stderr || ''}`.trim();
  }

  async function runProjectChecks(root, reportProblems) {
    if (!root || !reportProblems) return { ran: [] };
    const ran = [];
    const hasPkg = await fileExists(`${root}/package.json`);
    const hasTs = await fileExists(`${root}/tsconfig.json`);
    const hasCargo = await fileExists(`${root}/Cargo.toml`);

    if (hasPkg && hasTs) {
      const out = await runShell(root, 'npx', ['tsc', '--noEmit', '--pretty', 'false']);
      const parsed = window.CdrDiagnostics?.parseOutput?.(out) || [];
      if (parsed.length) reportProblems(parsed);
      ran.push('tsc');
    }

    if (hasCargo) {
      const out = await runShell(root, 'cargo', ['check', '--message-format=short']);
      const parsed = window.CdrDiagnostics?.parseOutput?.(out) || [];
      if (parsed.length) reportProblems(parsed);
      ran.push('cargo');
    }

    return { ran };
  }

  window.CdrProjectLint = { runProjectChecks };
})();
