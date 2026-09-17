// 渲染 store/assets/source/promo-440x280.html -> store/assets/promo-440x280.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const ROOT = '/Users/zizhan/projects/fillduck';
const src = fs.readFileSync(`${ROOT}/store/assets/source/promo-440x280.html`, 'utf8');
const icon = 'data:image/png;base64,' + fs.readFileSync(`${ROOT}/extension/icons/icon128.png`).toString('base64');
const b = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true });
const p = await b.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await p.setContent(src.replaceAll('__ICON__', icon), { waitUntil: 'load' });
await p.waitForTimeout(300);
await p.screenshot({ path: `${ROOT}/store/assets/promo-440x280.png`, clip: { x: 0, y: 0, width: 440, height: 280 } });
await b.close();
console.log('ok');
