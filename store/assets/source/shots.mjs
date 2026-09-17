/*
 * 填鸭 FillDuck 商店截图生成脚本
 * 跑法：
 *   cd <scratchpad> && python3 -m http.server 8766 --bind 127.0.0.1 （在项目根目录另开）
 *   CHROME_EXE="…/Google Chrome for Testing" node shots.mjs
 * 产物：<项目>/store/assets/screenshot-1..4.png（1280x800）
 *
 * 界面全部来自真实产品：侧边栏是真的 sidepanel.html，结果列表是真引擎
 * 在真测试页上跑出来的 res 对象，表单也是被引擎真的填过的。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = '/Users/zizhan/projects/fillduck';
const OUT = path.join(ROOT, 'store/assets');
const EXT = path.join(ROOT, 'extension');
const EXE = process.env.CHROME_EXE;
const HERE = path.dirname(new URL(import.meta.url).pathname);

const W = 1280, H = 800;
const BAND = 64;                 // 顶部说明条
const BODY = H - BAND;           // 736
const LEFT_W = 880, RIGHT_W = 399; // 880 + 1px 分隔线 + 399 = 1280

const PAPER = '#f3f6f3', LINE = '#d3ddd8', MALLARD = '#16615a';

const profiles = JSON.parse(fs.readFileSync(path.join(HERE, 'shot-profile.json'), 'utf8'));
const engineSrc = fs.readFileSync(path.join(EXT, 'vendor/fillduck.js'), 'utf8');
const recipes = JSON.parse(fs.readFileSync(path.join(EXT, 'vendor/recipes.json'), 'utf8'));
const iconB64 = fs.readFileSync(path.join(ROOT, 'extension/icons/icon128.png')).toString('base64');

const PERSON_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';
const seeded = [
  { id: PERSON_ID, ...profiles.person },
  { id: CASE_ID, ...profiles.case },
];

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-shots-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  executablePath: EXE,
  headless: true,
  viewport: { width: LEFT_W, height: BODY },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const EXT_ID = new URL(sw.url()).host;
console.log('扩展 id:', EXT_ID);
const SP_URL = `chrome-extension://${EXT_ID}/sidepanel.html`;

// ─────────── 左半：测试页 ───────────
const form = await ctx.newPage();
await form.setViewportSize({ width: LEFT_W, height: BODY });
await form.goto('http://127.0.0.1:8766/test/fixtures/generic.html', { waitUntil: 'load' });
const formBlank = await form.screenshot();

await form.addScriptTag({ content: engineSrc });
const res = await form.evaluate(
  ([input]) => window.fillduck(input),
  [{ mode: 'run', profile: profiles.person, recipes, files: [], forceGeneric: false }],
);
console.log('引擎结果：', JSON.stringify(res.summary), '配方：', res.recipe);
await form.waitForTimeout(400);
const formFilled = await form.screenshot();

// ─────────── 左半：示范页配方那一节 ───────────
const demo = await ctx.newPage();
await demo.setViewportSize({ width: LEFT_W, height: BODY });
await demo.goto('http://127.0.0.1:8766/demo/index.html#recipe', { waitUntil: 'load' });
await demo.waitForTimeout(800);
await demo.evaluate(() => {
  const el = document.querySelector('#recipe');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
});
await demo.waitForTimeout(500);
const demoShot = await demo.screenshot();

// ─────────── 右半：侧边栏 ───────────
const sp = await ctx.newPage();
await sp.setViewportSize({ width: RIGHT_W, height: BODY });
await sp.goto(SP_URL, { waitUntil: 'load' });
await sp.evaluate(
  ([list, sel]) => chrome.storage.local.set({ profiles: list, selectedId: sel }),
  [seeded, PERSON_ID],
);
await sp.reload({ waitUntil: 'load' });
await sp.waitForTimeout(600);

const scrollTo = (page, sel, pad = 8) =>
  page.evaluate(
    ([s, p]) => {
      const el = document.querySelector(s);
      window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - p));
    },
    [sel, pad],
  );

// 2 号图：页首「明文只存本机」提示 + 资料卡列表 + 编辑区标准字段
await sp.evaluate(() => window.scrollTo(0, 0));
await sp.waitForTimeout(250);
const spEditor = await sp.screenshot();

// 1 号 / 3 号图：真结果渲染进真侧边栏
await sp.evaluate(([r]) => window.renderResult(r), [res]);
await sp.waitForTimeout(250);
await scrollTo(sp, '#result', 0);
await sp.waitForTimeout(250);
const spResult = await sp.screenshot();

// 3 号图：滚到「跳过」那几条
await sp.evaluate(() => {
  const li = [...document.querySelectorAll('#result-body .results li')].find((x) => x.classList.contains('skip'));
  window.scrollTo(0, li.getBoundingClientRect().top + window.scrollY - 6);
});
await sp.waitForTimeout(250);
const spSkip = await sp.screenshot();

// 4 号图：切到 12315 案件卡
await sp.evaluate(([id]) => chrome.storage.local.set({ selectedId: id }), [CASE_ID]);
await sp.reload({ waitUntil: 'load' });
await sp.waitForTimeout(600);
await sp.evaluate(() => {
  const el = document.querySelector('#custom-fields').closest('fieldset');
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 6);
});
await sp.waitForTimeout(250);
const spCase = await sp.screenshot();

// ─────────── 拼版 ───────────
const composer = await ctx.newPage();
await composer.setViewportSize({ width: W, height: H });

async function compose(file, caption, leftBuf, rightBuf) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:${PAPER}}
    .band{height:${BAND}px;display:flex;align-items:center;gap:14px;padding:0 40px;box-sizing:border-box;
          font:600 22px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
          color:${MALLARD};letter-spacing:.2px}
    .band img{width:30px;height:30px;border-radius:7px;display:block}
    .body{height:${BODY}px;display:flex;background:${PAPER}}
    .body img{display:block}
    .sep{width:1px;height:${BODY}px;background:${LINE}}
  </style>
  <div class="band"><img src="data:image/png;base64,${iconB64}" alt=""><span>${caption}</span></div>
  <div class="body">
    <img src="data:image/png;base64,${leftBuf.toString('base64')}" width="${LEFT_W}" height="${BODY}">
    <div class="sep"></div>
    <img src="data:image/png;base64,${rightBuf.toString('base64')}" width="${RIGHT_W}" height="${BODY}">
  </div>`;
  await composer.setContent(html, { waitUntil: 'load' });
  await composer.waitForTimeout(200);
  const p = path.join(OUT, file);
  await composer.screenshot({ path: p, clip: { x: 0, y: 0, width: W, height: H } });
  console.log('写出', p);
}

await compose('screenshot-1.png', '一口填完，逐项告诉你填了什么', formFilled, spResult);
await compose('screenshot-2.png', '资料存一次，明文只存在你自己的电脑上', formBlank, spEditor);
await compose('screenshot-3.png', '密码框不填，已经填好的框不动', formFilled, spSkip);
await compose('screenshot-4.png', '老网站也能一次填对，最终提交永远留给你自己点', demoShot, spCase);

await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log('完成');
