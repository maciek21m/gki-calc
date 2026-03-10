#!/usr/bin/env node
// scripts/bump-version.cjs
// Usage: node scripts/bump-version.cjs [patch|minor|major|<version>]
const fs = require('fs');
const { execSync } = require('child_process');

function readJSON(path){ return JSON.parse(fs.readFileSync(path,'utf8')); }
function writeJSON(path,obj){ fs.writeFileSync(path, JSON.stringify(obj,null,2)+'\n', 'utf8'); }

function bumpSemver(v, type){
  const parts = v.split('.').map(n=>parseInt(n,10));
  if(parts.length !==3) throw new Error('version must be x.y.z');
  let [maj,min,patch] = parts;
  if(type==='major'){ maj+=1; min=0; patch=0; }
  else if(type==='minor'){ min+=1; patch=0; }
  else { patch+=1; }
  return `${maj}.${min}.${patch}`;
}

(async ()=>{
  const pkgPath = './package.json';
  const indexPath = './index.html';

  const pkg = readJSON(pkgPath);
  const arg = process.argv[2] || 'patch';
  let newVer = arg;
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if(arg === 'patch' || arg === 'minor' || arg === 'major'){
    newVer = bumpSemver(pkg.version, arg);
  } else if(!semverRegex.test(arg)){
    console.error('Invalid version argument. Use patch|minor|major or explicit x.y.z');
    process.exit(1);
  }

  // Update package.json
  pkg.version = newVer;
  writeJSON(pkgPath, pkg);
  console.log('Updated package.json to', newVer);

  // Update index.html title and h1
  let html = fs.readFileSync(indexPath,'utf8');
  // Replace <title>...</title>
  html = html.replace(/<title>.*?<\/title>/i, `<title>GKI Ketosis Calculator v${newVer}<\/title>`);
  // Replace existing h1 with id=app-title if present, otherwise replace first <h1>
  if(/<h1[^>]*id=["']app-title["'][^>]*>.*?<\/h1>/i.test(html)){
    html = html.replace(/<h1[^>]*id=["']app-title["'][^>]*>.*?<\/h1>/i, `<h1 id="app-title">GKI Ketosis Calculator v${newVer}<\/h1>`);
  } else if(/<h1[^>]*>.*?<\/h1>/i.test(html)){
    html = html.replace(/<h1[^>]*>.*?<\/h1>/i, `<h1 id="app-title">GKI Ketosis Calculator v${newVer}<\/h1>`);
  } else {
    // inject into header container
    html = html.replace(/(<header[^>]*>\s*<div[^>]*>)/i, `$1<h1 id="app-title">GKI Ketosis Calculator v${newVer}</h1>`);
  }
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Updated index.html title and header with v'+newVer);

  // Stage and commit changes
  try{
    execSync('git add package.json index.html', { stdio: 'inherit' });
    execSync(`git commit -m "Bump version to v${newVer}"`, { stdio: 'inherit' });
    console.log('Committed version bump');
  } catch(e){
    console.warn('Git commit failed (maybe no changes staged):', e.message);
  }

  console.log('Done. New version:', newVer);
})();
