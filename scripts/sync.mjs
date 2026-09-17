// 把 engine/ 与 recipes/ 同步到插件、skill、示范页三处副本
// 用法：node scripts/sync.mjs          写入副本
//       node scripts/sync.mjs --check  只检查副本是否一致，不一致时退出码 1
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const engine = readFileSync(join(root, 'engine/fillduck.js'), 'utf8');
const recipeFiles = readdirSync(join(root, 'recipes')).filter((f) => f.endsWith('.json')).sort();
const recipeTexts = Object.fromEntries(recipeFiles.map((f) => [f, readFileSync(join(root, 'recipes', f), 'utf8')]));
const recipes = recipeFiles.map((f) => JSON.parse(recipeTexts[f]));
const recipesJson = `${JSON.stringify(recipes, null, 2)}\n`;
if (/<\/script/i.test(engine) || /<\/script/i.test(recipesJson)) {
  console.error('引擎或配方里出现了 </script，无法内联进示范页');
  process.exit(1);
}

// 目标文件 → 期望内容
const targets = new Map([
  ['extension/vendor/fillduck.js', engine],
  ['extension/vendor/recipes.json', recipesJson],
  ['skill/fillduck/scripts/fillduck.js', engine],
  ...recipeFiles.map((f) => [`skill/fillduck/scripts/recipes/${f}`, recipeTexts[f]]),
]);

// 示范页：替换两个内联块
const demoPath = 'demo/index.html';
if (existsSync(join(root, demoPath))) {
  const html = readFileSync(join(root, demoPath), 'utf8');
  const inline = (src, id, body) => {
    const re = new RegExp(`(<script id="${id}"[^>]*>)[\\s\\S]*?(</script>)`);
    if (!re.test(src)) throw new Error(`${demoPath} 缺少 <script id="${id}">`);
    return src.replace(re, (_, open, close) => `${open}\n${body}\n${close}`);
  };
  targets.set(demoPath, inline(inline(html, 'fillduck-engine', engine.trimEnd()), 'fillduck-recipes', recipesJson.trimEnd()));
}

let bad = 0;
for (const [rel, want] of targets) {
  const file = join(root, rel);
  const have = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (have === want) continue;
  if (check) {
    bad++;
    console.log(`✗ ${rel} ${have == null ? '缺失' : '与源文件不一致'}`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, want);
    console.log(`→ ${relative(root, file)}`);
  }
}
if (check) {
  console.log(bad ? `\n${bad} 个副本不一致，请运行 node scripts/sync.mjs` : `✓ ${targets.size} 个副本全部一致`);
  process.exit(bad ? 1 : 0);
}
