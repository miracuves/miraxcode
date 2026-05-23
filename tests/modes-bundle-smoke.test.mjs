/**
 * Wave 9+14 — ensure mode bundles are produced by esbuild (pretest runs build:js).
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
  'forge.bundle.js',
  'agent-maker.bundle.js',
  'finance.bundle.js',
  'sandbox.bundle.js',
  'systems.bundle.js',
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

test('lazy mode bundles register globals', () => {
  const checks = [
    ['forge.bundle.js', 'ForgeMode'],
    ['agent-maker.bundle.js', 'SwarmMaker'],
    ['finance.bundle.js', 'FinanceMode'],
    ['sandbox.bundle.js', 'SandboxMode'],
    ['systems.bundle.js', 'SystemMaker'],
  ];
  for (const [file, symbol] of checks) {
    const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
    assert.ok(src.includes(symbol), `${file} should reference ${symbol}`);
    assert.ok(src.includes('_registeredModes'), `${file} should register mode`);
  }
});
