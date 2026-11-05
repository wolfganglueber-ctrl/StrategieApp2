// Baut die Artefakt-Version (claude.ai) aus dist/hexkrone.html: ohne eigenes <html>/<head>/<body>-Gerüst.
// Aufruf: npm run build:artifact  →  dist/hexkrone-artifact.html
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'tools/build-single.mjs')], { stdio: 'inherit' });
let s = readFileSync(join(root, 'dist/hexkrone.html'), 'utf8');
s = s
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<meta charset="utf-8" \/>\s*/, '')
  .replace('</head>', '')
  .replace('<body>', '')
  .replace('</body>', '')
  .replace('</html>', '')
  .replace(':root {\n  --bg: #0d2238;', ':root {\n  color-scheme: dark;\n  --bg: #0d2238;');
s = '<title>KnightyKnight</title>\n' + s.replace('<title>KnightyKnight</title>', '');
writeFileSync(join(root, 'dist/hexkrone-artifact.html'), s);
console.log(`dist/hexkrone-artifact.html (${(s.length / 1024).toFixed(0)} KB)`);
