// 打包发行物：dist/fillduck-extension.zip（Chrome/Edge）、dist/fillduck-skill.zip、dist/fillduck-firefox.zip
// 出包前先跑三道门禁：自检、副本一致性、隐私扫描；任一不过就不出包。
// 用法：node scripts/pack.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, cpSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// 真实案件关键词表放在本机未入库的 private-words.txt（每行一个），
// 免得关键词表本身把真实信息带进公开仓库。文件不存在时跳过这道扫描并提示。
const wordsFile = join(root, 'private-words.txt');
const PRIVATE_WORDS = existsSync(wordsFile)
  ? readFileSync(wordsFile, 'utf8').split('\n').map((w) => w.trim()).filter((w) => w && !w.startsWith('#'))
  : [];
const SCAN_DIRS = ['extension', 'skill', 'demo', 'engine', 'recipes', 'store', 'docs', 'README.md'];

console.log('① 自检');
try {
  console.log(run('node', ['scripts/selfcheck.mjs']).trim().split('\n').pop());
} catch (e) {
  console.error(e.stdout || e.message);
  die('自检没过');
}

console.log('② 副本一致性');
try {
  console.log(run('node', ['scripts/sync.mjs', '--check']).trim().split('\n').pop());
} catch (e) {
  console.error(e.stdout || e.message);
  die('副本与源文件不一致，先跑 node scripts/sync.mjs');
}

console.log('③ 隐私扫描');
let hits = '';
if (!PRIVATE_WORDS.length) console.log('跳过：没有 private-words.txt（每行一个真实案件关键词，不要入库）');
else {
try {
  hits = run('grep', ['-rIn', '-E', PRIVATE_WORDS.join('|'), ...SCAN_DIRS]);
} catch (e) {
  hits = ''; // grep 没命中时退出码为 1，正是我们要的
}
if (hits.trim()) {
  console.error(hits);
  die('发行物里出现了真实案件关键词');
}
  console.log(`✓ ${SCAN_DIRS.length} 处扫描，无命中`);
}

console.log('④ 图标');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
const wantIcons = { 16: null, 48: null, 128: null };
for (const size of Object.keys(wantIcons)) {
  const rel = manifest.icons?.[size];
  if (!rel) die(`manifest.json 的 icons 缺少 ${size}`);
  const file = join(root, 'extension', rel);
  if (!existsSync(file)) die(`缺少图标文件 ${rel}`);
  // PNG 头：宽高各 4 字节大端，位于第 16 字节起
  const buf = readFileSync(file);
  if (buf.subarray(1, 4).toString() !== 'PNG') die(`${rel} 不是 PNG`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== Number(size) || h !== Number(size)) die(`${rel} 实际是 ${w}×${h}，应为 ${size}×${size}`);
}
console.log('✓ 16 / 48 / 128 三个图标尺寸正确');

console.log('⑤ 打包');
const dist = join(root, 'dist');
const stage = join(dist, 'stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, 'extension'), join(stage, 'fillduck-extension'), { recursive: true });
cpSync(join(root, 'skill/fillduck'), join(stage, 'fillduck'), { recursive: true });
for (const f of run('find', [stage, '-name', '.DS_Store']).split('\n').filter(Boolean)) rmSync(f);

// 插件包：manifest.json 必须在压缩包根目录，商店才认（外面套一层目录会被判「找不到 manifest.json」）
// skill 包：保留 fillduck/ 外层目录，解压后直接就是一个 skill 目录
const zips = [
  ['fillduck-extension.zip', 'fillduck-extension', true],
  ['fillduck-skill.zip', 'fillduck', false],
];
for (const [zip, dir, atRoot] of zips) {
  rmSync(join(dist, zip), { force: true });
  if (atRoot) run('zip', ['-qrX', join('..', '..', zip), '.'], { cwd: join(stage, dir) });
  else run('zip', ['-qrX', join('..', zip), dir], { cwd: stage });
}

// 解压回来逐字节比对，确认包里就是源目录
const check = join(dist, 'check');
rmSync(check, { recursive: true, force: true });
mkdirSync(check);
run('unzip', ['-q', join(dist, 'fillduck-extension.zip'), '-d', join(check, 'ext')]);
run('unzip', ['-q', join(dist, 'fillduck-skill.zip'), '-d', check]);
if (!existsSync(join(check, 'ext/manifest.json'))) die('插件包里 manifest.json 不在根目录，商店会拒收');
run('diff', ['-r', join(root, 'extension'), join(check, 'ext')]);
run('diff', ['-r', join(root, 'skill/fillduck'), join(check, 'fillduck')]);
rmSync(check, { recursive: true, force: true });
rmSync(stage, { recursive: true, force: true });

for (const [zip] of zips) console.log(`→ dist/${zip}  ${(statSync(join(dist, zip)).size / 1024).toFixed(1)} KB`);

console.log('⑥ Firefox 包');
try {
  console.log(run('node', ['scripts/build-firefox.mjs']).trim().split('\n').pop());
} catch (e) {
  console.error(e.stdout || e.message);
  die('Firefox 包没生成');
}
console.log(`✓ 插件版本 ${manifest.version}，可以上架或本地加载（见 store/README.md）`);

const assets = join(root, 'store/assets');
const missing = ['icon128.png', 'screenshot-1.png', 'screenshot-2.png', 'screenshot-3.png', 'screenshot-4.png', 'promo-440x280.png'].filter(
  (f) => !existsSync(join(assets, f)),
);
if (missing.length) console.log(`提醒：商店素材还缺 ${missing.join('、')}`);
