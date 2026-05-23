/**
 * Wave 9 — ensure mode bundles are produced by esbuild (pretest runs build:js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = path.join(root, 'src/js');

const bundles = [
  'app.bundle.js',
  'code-mode.bundle.js',
  'virtual-os.bundle.js',
];

for (const name of bundles) {
  test(`${name} exists and is non-empty`, () => {
    const p = path.join(jsDir, name);
    assert.ok(fs.existsSync(p), `missing ${p} — run npm run build:js`);
    const stat = fs.statSync(p);
    assert.ok(stat.size > 1000, `${name} looks too small (${stat.size} bytes)`);
  });
}

test('code-mode.bundle.js references CoderMode and _registeredModes', () => {
  const src = fs.readFileSync(path.join(jsDir, 'code-mode.bundle.js'), 'utf8');
  assert.ok(src.includes('CoderMode'), 'expected CoderMode export');
  assert.ok(src.includes('_registeredModes'), 'expected mode registration');
});

test('virtual-os.bundle.js references VoidStudio', () => {
  const src = fs.readFileSync(path.join(jsDir, 'virtual-os.bundle.js'), 'utf8');
  assert.ok(src.includes('VoidStudio'), 'expected VoidStudio export');
});
