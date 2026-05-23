import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  absWorkingDir: __dirname,
  entryPoints: ['src/js/app/index.js'],
  outfile: 'src/js/app.bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
  legalComments: 'none',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching src/js/app → src/js/app.bundle.js');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild] built src/js/app.bundle.js');
}
