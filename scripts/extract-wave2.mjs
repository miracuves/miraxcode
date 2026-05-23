/**
 * Extract module bodies from bootstrap.js into _extract/ for wave-2 modules.
 * Run: node scripts/extract-wave2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOT = path.join(ROOT, 'src/js/app/bootstrap.js');
const OUT = path.join(ROOT, 'src/js/app/_extract');

function sliceBody(lines, start, end) {
  return lines
    .slice(start - 1, end)
    .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
    .join('\n');
}

const lines = fs.readFileSync(BOOT, 'utf8').split('\n');
fs.mkdirSync(OUT, { recursive: true });

/** Line ranges are 1-based, inclusive, in bootstrap.js (inside boot()). */
const chunks = {
  'cloud-fetch': [2163, 2219],
  'cloud-catalog': [[4090, 4934], [4949, 5494]],
  messages: [5583, 6691],
  'agent-turns': [8125, 9184],
  rag: [9554, 9801],
};

for (const [name, ranges] of Object.entries(chunks)) {
  const segs = Array.isArray(ranges[0]) ? ranges : [ranges];
  const body = segs.map(([s, e]) => sliceBody(lines, s, e)).join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.js`), body + '\n');
  const n = segs.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
  console.log(`wrote ${name}.js (${n} lines)`);
}
