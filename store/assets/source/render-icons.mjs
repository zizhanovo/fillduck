// 把 store/assets/source/icon-*.svg 渲染成精确尺寸的不透明 PNG
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/zizhan/projects/fillduck';
const EXE = process.env.CHROME_EXE;
const SRC = path.join(ROOT, 'store/assets/source');
const ICONS = path.join(ROOT, 'extension/icons');
const STORE = path.join(ROOT, 'store/assets');

const jobs = [
  { size: 16, svg: 'icon-16.svg', out: [path.join(ICONS, 'icon16.png')] },
  { size: 48, svg: 'icon-48.svg', out: [path.join(ICONS, 'icon48.png')] },
  { size: 128, svg: 'icon-128.svg', out: [path.join(ICONS, 'icon128.png'), path.join(STORE, 'icon128.png')] },
];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const j of jobs) {
  const svg = fs.readFileSync(path.join(SRC, j.svg), 'utf8');
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#16615a}svg{display:block}</style>${svg}`,
  );
  const buf = await page.screenshot({ omitBackground: false });
  for (const o of j.out) fs.writeFileSync(o, buf);
  await page.close();
  console.log(j.svg, '->', j.out.join(', '));
}

// 放大预览图，方便人眼检查
const page = await browser.newPage({ viewport: { width: 760, height: 360 }, deviceScaleFactor: 1 });
const b64 = (p) => fs.readFileSync(p).toString('base64');
await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
 body{margin:0;background:#fff;font:13px system-ui;display:flex;gap:24px;padding:20px;align-items:flex-start}
 .col{text-align:center}
 img{image-rendering:pixelated;display:block;margin-bottom:6px}
 .strip{display:flex;gap:10px;align-items:center;margin-top:16px;padding:8px;border-radius:6px}
 .light{background:#f5f5f5}.dark{background:#202124}
</style>
<div class="col"><img src="data:image/png;base64,${b64(path.join(ICONS, 'icon16.png'))}" width="256" height="256"><b>16 放大 16x</b>
  <div class="strip light"><img src="data:image/png;base64,${b64(path.join(ICONS, 'icon16.png'))}" width="16" height="16"><span>浅色栏 1:1</span></div>
  <div class="strip dark" style="color:#fff"><img src="data:image/png;base64,${b64(path.join(ICONS, 'icon16.png'))}" width="16" height="16"><span>深色栏 1:1</span></div>
</div>
<div class="col"><img src="data:image/png;base64,${b64(path.join(ICONS, 'icon48.png'))}" width="192" height="192"><b>48 放大 4x</b></div>
<div class="col"><img src="data:image/png;base64,${b64(path.join(ICONS, 'icon128.png'))}" width="192" height="192"><b>128 缩到 192</b></div>`);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-zizhan-projects-fillduck/31338577-3a6b-4c19-9b9b-bfda5134688e/scratchpad/icon-preview.png' });
await browser.close();
console.log('done');
