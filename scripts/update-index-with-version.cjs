// scripts/update-index-with-version.cjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const indexPath = path.resolve(__dirname, '..', 'index.html');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '0.0.0';

let html = readFileSync(indexPath, 'utf8');
// Replace title
html = html.replace(/<title>.*?<\/title>/i, `<title>GKI Ketosis Calculator v${version}<\/title>`);
// Replace h1 with id=app-title or first h1
if(/<h1[^>]*id=["']app-title["'][^>]*>.*?<\/h1>/i.test(html)){
  html = html.replace(/<h1[^>]*id=["']app-title["'][^>]*>.*?<\/h1>/i, `<h1 id="app-title">GKI Ketosis Calculator v${version}<\/h1>`);
} else if(/<h1[^>]*>.*?<\/h1>/i.test(html)){
  html = html.replace(/<h1[^>]*>.*?<\/h1>/i, `<h1 id="app-title">GKI Ketosis Calculator v${version}<\/h1>`);
} else {
  // inject into header div
  html = html.replace(/(<header[^>]*>\s*<div[^>]*>)/i, `$1<h1 id="app-title">GKI Ketosis Calculator v${version}<\/h1>`);
}

writeFileSync(indexPath, html, 'utf8');
console.log('index.html updated with version', version);
