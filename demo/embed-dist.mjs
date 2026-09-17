// 把 dist/ 下的插件与 skill 压缩包以 base64 内联进示范页的 <script id="fillduck-dist">
// 原因：Artifact 的 assets 能力不接受 zip，且会让页面变成仅组织内可见；
//       内联后由页面调用 downloads 能力保存（zip 在其允许的扩展名里）。
// 用法：node demo/embed-dist.mjs          内联 dist/fillduck-extension.zip、dist/fillduck-skill.zip（缺哪个跳过哪个）
//       node demo/embed-dist.mjs --clear  清空内联块，恢复「待发布」状态
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'demo/index.html');
const ITEMS = { extension: 'dist/fillduck-extension.zip', skill: 'dist/fillduck-skill.zip' };

const data = {};
if (!process.argv.includes('--clear'))
  for (const [key, rel] of Object.entries(ITEMS)) {
    const file = join(root, rel);
    if (!existsSync(file)) {
      console.log(`- 跳过 ${rel}（不存在）`);
      continue;
    }
    const buf = readFileSync(file);
    data[key] = { file: rel.split('/').pop(), size: statSync(file).size, sha256: createHash('sha256').update(buf).digest('hex'), base64: buf.toString('base64') };
    console.log(`→ 内联 ${rel}  ${(buf.length / 1024).toFixed(1)} KB`);
  }

const html = readFileSync(page, 'utf8');
const re = /(<script id="fillduck-dist"[^>]*>)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error('demo/index.html 缺少 <script id="fillduck-dist">');
const out = html.replace(re, (_, open, close) => `${open}\n${JSON.stringify(data)}\n${close}`);
writeFileSync(page, out);
const mb = Buffer.byteLength(out) / 1024 / 1024;
console.log(`✓ demo/index.html ${mb.toFixed(2)} MB${mb > 15 ? '（接近 Artifact 16MB 上限！）' : ''}`);
