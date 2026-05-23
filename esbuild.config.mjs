import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const shared = {
  absWorkingDir: __dirname,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
  legalComments: 'none',
};

const entryPoints = [
  { in: 'src/js/app/index.js', out: 'app.bundle' },
  { in: 'src/js/modes/code/index.js', out: 'code-mode.bundle' },
  { in: 'src/js/modes/virtual-os/index.js', out: 'virtual-os.bundle' },
  { in: 'src/js/modes/forge/index.js', out: 'forge.bundle' },
  { in: 'src/js/modes/agent-maker/index.js', out: 'agent-maker.bundle' },
  { in: 'src/js/modes/finance/index.js', out: 'finance.bundle' },
  { in: 'src/js/modes/sandbox/index.js', out: 'sandbox.bundle' },
  { in: 'src/js/modes/systems/index.js', out: 'systems.bundle' },
];

async function buildAll() {
  if (watch) {
    const ctx = await esbuild.context({ ...shared, entryPoints, outdir: 'src/js' });
    await ctx.watch();
    console.log('[esbuild] watching mode bundles → src/js/*.bundle.js');
    return;
  }
  await esbuild.build({ ...shared, entryPoints, outdir: 'src/js' });
  console.log('[esbuild] built app.bundle.js, code-mode.bundle.js, virtual-os.bundle.js, forge.bundle.js, agent-maker.bundle.js, finance.bundle.js, sandbox.bundle.js, systems.bundle.js');
}

await buildAll();
