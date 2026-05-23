import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'src/js/cdr-diagnostics.js'), 'utf8');
const sandbox = { window: {}, console };
const ctx = createContext(sandbox);
runInContext(code, ctx);
const { parseOutput } = sandbox.window.CdrDiagnostics;

test('parses TypeScript diagnostic line', () => {
  const out = parseOutput('src/app.ts(12,4): error TS2322: Type mismatch');
  assert.equal(out.length, 1);
  assert.equal(out[0].file, 'src/app.ts');
  assert.equal(out[0].line, 12);
  assert.equal(out[0].source, 'tsc');
});

test('parses rustc arrow location', () => {
  const text = `error[E0425]: cannot find value \`foo\`
  --> src/lib.rs:10:5`;
  const out = parseOutput(text);
  const hit = out.find(p => p.source === 'rustc' && p.file === 'src/lib.rs');
  assert.ok(hit);
  assert.equal(hit.line, 10);
});
