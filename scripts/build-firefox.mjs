// 生成 Firefox 包：dist/firefox/ 与 dist/fillduck-firefox.zip
// 插件源码与 Chrome/Edge 共用一份，差异全部收在这个脚本里，只有三处：
//   ① 侧边栏：Chrome/Edge 用 side_panel，Firefox 用 sidebar_action
//   ② 后台：Chrome/Edge 用 service_worker，Firefox 只支持 scripts（事件页）
//   ③ 权限：Firefox 没有 sidePanel 权限，minimum_chrome_version 是 Chrome 专有键
// 另有两条 AMO 的硬要求写在下面的常量里，改动前先读注释。
// 用法：node scripts/build-firefox.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// AMO 给 Manifest V3 扩展签名时必须自带 ID，它不会替你分配；改这个 ID 等于换一个扩展。
// 上架后不要再动，否则老用户收不到更新。
const GECKO_ID = 'fillduck@zizhanovo.github.io';

// 下限由最高的那条要求决定：
//   optional_host_permissions 要 128
//   browser_specific_settings.gecko.data_collection_permissions 要 140（web-ext lint 认定的版本）
// 侧边栏是桌面特性，所以不声明 gecko_android，AMO 上只对桌面版 Firefox 提供。
const STRICT_MIN_VERSION = '140.0';

// AMO 从 2025-11-03 起要求每个新提交申报数据收集类型。
// 填鸭不发任何网络请求、资料只存本机，所以是 none。
// 这不是可以照抄的默认值：哪天插件开始往外传数据，这里必须同步改。
const DATA_COLLECTION_PERMISSIONS = { required: ['none'] };

const src = join(root, 'extension');
const out = join(root, 'dist/firefox');
const chromeManifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));

console.log('① 生成 Firefox manifest');
if (!chromeManifest.side_panel?.default_path) die('extension/manifest.json 里没有 side_panel.default_path，无法推导侧边栏页面');
if (!chromeManifest.background?.service_worker) die('extension/manifest.json 里没有 background.service_worker，无法推导后台脚本');

const firefoxManifest = {
  manifest_version: chromeManifest.manifest_version,
  name: chromeManifest.name,
  version: chromeManifest.version,
  description: chromeManifest.description,
  icons: chromeManifest.icons,
  // 工具栏按钮：Firefox 侧边栏没有「点击即展开」的开关，由 background.js 接管点击
  action: chromeManifest.action,
  sidebar_action: {
    default_panel: chromeManifest.side_panel.default_path,
    default_icon: chromeManifest.icons,
  },
  background: { scripts: [chromeManifest.background.service_worker] },
  permissions: (chromeManifest.permissions || []).filter((p) => p !== 'sidePanel'),
  host_permissions: chromeManifest.host_permissions,
  optional_host_permissions: chromeManifest.optional_host_permissions,
  browser_specific_settings: {
    gecko: {
      id: GECKO_ID,
      strict_min_version: STRICT_MIN_VERSION,
      data_collection_permissions: DATA_COLLECTION_PERMISSIONS,
    },
  },
};

// 不该出现在 Firefox 包里的键，出了就是脚本没同步
for (const bad of ['side_panel', 'minimum_chrome_version']) {
  if (bad in firefoxManifest) die(`Firefox manifest 里残留了 ${bad}`);
}
if (firefoxManifest.background.service_worker) die('Firefox manifest 里残留了 background.service_worker');
if (firefoxManifest.permissions.includes('sidePanel')) die('Firefox manifest 里残留了 sidePanel 权限');
if (!firefoxManifest.browser_specific_settings.gecko.id) die('缺少 gecko.id，AMO 不会给 MV3 扩展分配 ID');
console.log(`✓ 侧边栏换成 sidebar_action，后台换成事件页，权限去掉 sidePanel`);
console.log(`✓ gecko.id=${GECKO_ID}，strict_min_version=${STRICT_MIN_VERSION}，数据收集=none`);

console.log('② 复制源码');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });
for (const f of run('find', [out, '-name', '.DS_Store']).split('\n').filter(Boolean)) rmSync(f);
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(firefoxManifest, null, 2)}\n`);

// 副本必须与源目录逐字节一致，只允许 manifest.json 不同
console.log('③ 与源目录比对');
try {
  run('diff', ['-r', '-x', 'manifest.json', src, out]);
} catch {
  die('dist/firefox 与 extension/ 不一致，除了 manifest.json 不该有任何差异');
}
console.log('✓ 除 manifest.json 外与 extension/ 完全一致');

console.log('④ 打包');
const dist = join(root, 'dist');
const zip = 'fillduck-firefox.zip';
rmSync(join(dist, zip), { force: true });
// manifest.json 必须在压缩包根目录，AMO 才认
run('zip', ['-qrX', join('..', zip), '.'], { cwd: out });

// 解压回来确认包里就是刚生成的目录
const check = join(dist, 'check-firefox');
rmSync(check, { recursive: true, force: true });
mkdirSync(check);
run('unzip', ['-q', join(dist, zip), '-d', check]);
if (!existsSync(join(check, 'manifest.json'))) die('Firefox 包里 manifest.json 不在根目录，AMO 会拒收');
run('diff', ['-r', out, check]);
rmSync(check, { recursive: true, force: true });

console.log(`→ dist/${zip}  ${(statSync(join(dist, zip)).size / 1024).toFixed(1)} KB`);
console.log(`✓ Firefox 包 ${firefoxManifest.version}，可上 AMO，也可 about:debugging 临时加载`);
// 用 Mozilla 官方 linter 复验：npx web-ext lint --source-dir dist/firefox
// 已验证 0 error。会剩一条 Android 告警，因为没声明 gecko_android——
// 侧边栏是桌面特性，本来就不该在 Android 上架，那条不是漏配。
