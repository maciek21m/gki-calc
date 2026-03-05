const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

(async () => {
  const url = 'http://127.0.0.1:8080/demo.html';
  const outDir = path.resolve(process.cwd(), 'recordings');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Launching browser (Chromium)...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const context = await browser.newContext({
    viewport: { width: 720, height: 900 },
    recordVideo: { dir: outDir, size: { width: 720, height: 900 } }
  });

  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE:', msg.text()));
  page.on('dialog', async dialog => {
    console.log('Dialog shown:', dialog.message());
    try { await dialog.dismiss(); } catch (e) {}
  });

  console.log('Navigating to demo page:', url);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  await page.waitForSelector('#startDemo', { timeout: 10000 });
  console.log('Starting automated demo...');
  await page.click('#startDemo');

  const RECORD_MS = 14000;
  await page.waitForTimeout(RECORD_MS);

  console.log('Closing browser and saving video...');
  await context.close();
  await browser.close();

  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) {
    console.error('No webm recording found in', outDir);
    process.exit(1);
  }
  const filePaths = files.map(f => ({ f, m: fs.statSync(path.join(outDir,f)).mtimeMs }));
  filePaths.sort((a,b)=>b.m-a.m);
  const webm = path.join(outDir, filePaths[0].f);
  const mp4 = path.join(process.cwd(), 'demo.mp4');

  console.log('Recorded webm file:', webm);

  const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (ffmpegCheck.status === 0) {
    console.log('Converting to MP4 with ffmpeg...');
    const args = ['-y', '-i', webm, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', mp4];
    const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (r.status === 0) {
      console.log('MP4 created at', mp4);
    } else {
      console.error('ffmpeg conversion failed. WebM saved at', webm);
    }
  } else {
    console.warn('ffmpeg not found. WebM recording saved at', webm, '. To convert to mp4, install ffmpeg or use an online converter.');
  }
})();