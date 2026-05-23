/**
 * Remove wave-2 extracted line ranges from bootstrap.js (bottom-up).
 * Run after modules are generated: node scripts/strip-bootstrap-wave2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOT = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'src/js/app/bootstrap.js',
);

const ranges = [
  [9554, 9801], // rag
  [8125, 9184], // agent-turns
  [5583, 6691], // messages
  [4949, 5494], // cloud-catalog (stream + helpers; keep initMcpOnBoot in bootstrap)
  [4090, 4934], // cloud-catalog (fallbacks + populate)
  [2163, 2219], // cloud-fetch
  [2016, 2161], // native http (moved to providers/http-native.js)
];

const lines = fs.readFileSync(BOOT, 'utf8').split('\n');
const sorted = [...ranges].sort((a, b) => b[0] - a[0]);
let removed = 0;
for (const [start, end] of sorted) {
  const n = end - start + 1;
  lines.splice(start - 1, n);
  removed += n;
  console.log(`removed ${start}-${end} (${n} lines)`);
}
fs.writeFileSync(BOOT, lines.join('\n'));
console.log(`total removed ${removed} lines → ${lines.length} lines`);
