// Baut das Spiel zu einer einzigen HTML-Datei (dist/hexkrone.html) – ideal zum Verschicken oder Hochladen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const order = [];
const seen = new Set();
const IMPORT_RE = /import\s*(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s*from\s*['"]([^'"]+)['"];?/g;

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) visit(resolve(dirname(file), m[1]));
  order.push(file);
}
visit(join(root, 'js/main.js'));

const names = new Map();
let js = '';
for (const f of order) {
  let src = readFileSync(f, 'utf8').replace(IMPORT_RE, '').replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
  for (const m of src.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (names.has(m[1])) throw new Error(`Namenskonflikt: ${m[1]} in ${f} und ${names.get(m[1])}`);
    names.set(m[1], f);
  }
  js += `\n// ---- ${f.slice(root.length + 1)} ----\n${src}`;
}

const icon = 'data:image/png;base64,' + readFileSync(join(root, 'icons/icon-192.png')).toString('base64');
let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="(icon|apple-touch-icon)" href="[^"]*"\s*\/>/g, `<link rel="$1" href="${icon}" />`)
  .replace(/<link rel="stylesheet" href="css\/style.css" \/>/, () => `<style>\n${css}</style>`)
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">\n${js.replace(/<\/script/g, '<\\/script')}\n</script>`);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/hexkrone.html'), html);
console.log(`dist/hexkrone.html (${(html.length / 1024).toFixed(0)} KB, ${order.length} Module)`);
