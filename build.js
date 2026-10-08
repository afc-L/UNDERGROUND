// Bundles the game into one self-contained HTML file (dist/underground.html)
// that opens straight from disk (file://) with no server.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  alias: { three: path.join(root, 'vendor/three/three.module.js') },
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="\.\/styles\.css" \/>/, () => `<style>\n${css}\n</style>`)
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, () => `<script>/* three.js (MIT) bundled */\n${js}</script>`);

const out = path.join(dist, 'underground.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

// The website (site/) serves the same standalone build as its playable page.
fs.copyFileSync(out, path.join(root, 'site/play.html'));
console.log('Copied it to site/play.html');
