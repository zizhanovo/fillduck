// 填鸭自检：在 Node 里用 mode: 'validate' 跑配方与资料卡校验，不碰 DOM
// 用法：node scripts/selfcheck.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function loadEngine(file = join(root, 'engine/fillduck.js')) {
  return new Function(`${readFileSync(file, 'utf8')}\nreturn fillduck;`)();
}
const fillduck = loadEngine();
const recipes = readdirSync(join(root, 'recipes'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'recipes', f), 'utf8')));
const jubao = recipes.find((r) => r.id === '12315-jubao');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const validate = (extra) => fillduck({ mode: 'validate', ...extra });
const allErrors = (res) => [...res.recipes.flatMap((r) => r.errors), ...res.profileErrors, ...res.checks.flatMap((c) => c.errors)];

const goodRecipe = {
  id: 'demo',
  name: '示例',
  version: 1,
  match: { host: 'localhost' },
  steps: [
    {
      name: '第一步',
      path: '^/',
      final: true,
      actions: [
        { do: 'fill', target: ['#a', '#b'], value: '{{姓名}}', required: true },
        { do: 'call', fn: 'page.refresh', args: ['{{手机}}', 1, true] },
        { do: 'check', target: ['input[name=x]'], when: '{{类型}}==甲' },
      ],
      submit: ['#submit'],
    },
  ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function caseCard(over = {}, drop = []) {
  const base = {
    商品名称: '线上课程',
    商品类别: '其他技能培训服务',
    其他类别描述: '个人成长类线上课程服务',
    销售方式: '网购',
    电商平台: '腾讯',
    订单号: '',
    举报问题类别: '对商品或者服务作引人误解的虚假宣传',
    医药腐败: '否',
    处理单位: '示例省/示例市/示例区市场监督管理局',
    举报内容: '虚构示例：页面宣称七天见效，实际没有任何课程内容。',
    ...over,
  };
  return {
    name: '虚构案件',
    type: '案件',
    fields: { company: '示例鸭鸭文化传媒有限公司', address: '示例市鸭子路 1 号' },
    custom: Object.entries(base)
      .filter(([k]) => !drop.includes(k))
      .map(([label, value], i) => ({ key: `f${i}`, label, value })),
  };
}
const caseErrors = async (profile, files = []) => {
  const res = await validate({ recipes: [jubao], profile, files });
  return res.checks.flatMap((c) => c.errors);
};

// ── 配方格式 ──
test('合规配方通过校验，并列出会调用的页面函数', async () => {
  const res = await validate({ recipes: [goodRecipe] });
  assert.equal(res.ok, true, allErrors(res).join('\n'));
  assert.deepEqual(res.recipes[0].calls, ['page.refresh']);
});
test('内置配方全部通过校验', async () => {
  const res = await validate({ recipes });
  assert.equal(res.ok, true, allErrors(res).join('\n'));
});
test('非法动作被拒绝', async () => {
  const r = clone(goodRecipe);
  r.steps[0].actions.push({ do: 'eval', code: 'alert(1)' });
  const res = await validate({ recipes: [r] });
  assert.equal(res.ok, false);
  assert.match(res.recipes[0].errors.join(), /未知动作「eval」/);
});
test('动作缺字段被拒绝', async () => {
  const r = clone(goodRecipe);
  r.steps[0].actions.push({ do: 'typeAndPick', target: ['#x'], value: '{{a}}' });
  r.steps[0].actions.push({ do: 'fill', value: '{{a}}' });
  const res = await validate({ recipes: [r] });
  const text = res.recipes[0].errors.join('\n');
  assert.match(text, /typeAndPick 动作缺少 options/);
  assert.match(text, /fill 动作缺少 target/);
});
test('配方本身缺字段被拒绝', async () => {
  const r = clone(goodRecipe);
  delete r.version;
  delete r.match;
  r.steps[0].path = '([';
  const text = (await validate({ recipes: [r] })).recipes[0].errors.join('\n');
  assert.match(text, /version/);
  assert.match(text, /match\.host/);
  assert.match(text, /合法的正则/);
});
test('非法 when、代码形式的函数名与参数被拒绝', async () => {
  const r = clone(goodRecipe);
  r.steps[0].actions.push({ do: 'fill', target: ['#x'], value: 'a', when: '{{a}} > 3' });
  r.steps[0].actions.push({ do: 'call', fn: 'alert(1)' });
  r.steps[0].actions.push({ do: 'call', fn: 'go', args: [{ x: 1 }] });
  r.steps[0].actions.push({ do: 'builtin', name: 'nope.nope' });
  const text = (await validate({ recipes: [r] })).recipes[0].errors.join('\n');
  assert.match(text, /when/);
  assert.match(text, /不能是代码/);
  assert.match(text, /只能是字面量数组/);
  assert.match(text, /未知的内置动作/);
});

test('拼错的选项名与错误类型被拒绝', async () => {
  const r = clone(goodRecipe);
  r.steps[0].actions.push({ do: 'fill', target: ['#x'], value: 'a', verifytarget: ['#y'], required: 'yes' });
  const text = (await validate({ recipes: [r] })).recipes[0].errors.join('\n');
  assert.match(text, /verifytarget：未知选项/);
  assert.match(text, /required：必须是 true 或 false/);
});

// ── 资料卡 ──
test('资料卡缺类型、含密码字段被拒绝', async () => {
  const res = await validate({ profile: { name: 'x', type: '朋友', custom: [{ key: 'pw', label: '登录密码', value: '1' }] } });
  const text = res.profileErrors.join('\n');
  assert.match(text, /类型必须是/);
  assert.match(text, /密码/);
});
test('「支付方式」「会员卡号」这类正常字段不被误拦', async () => {
  const res = await validate({ profile: { name: 'x', type: '案件', custom: [{ key: 'a', label: '支付方式', value: '微信' }, { key: 'b', label: '会员卡号', value: '1' }] } });
  assert.deepEqual(res.profileErrors, []);
});

// ── 12315 案件卡 ──
test('合规案件卡通过', async () => {
  assert.deepEqual(await caseErrors(caseCard(), [{ name: 'a.png', size: 1000 }]), []);
});
test('举报内容 410 字报出字数', async () => {
  const errs = await caseErrors(caseCard({ 举报内容: '鸭'.repeat(410) }));
  assert.ok(errs.some((e) => /410 字/.test(e)), errs.join());
});
test('举报内容首尾空白不计字数', async () => {
  assert.deepEqual(await caseErrors(caseCard({ 举报内容: `  ${'鸭'.repeat(400)}\n` })), []);
});
test('其他类别描述含非汉字或「其他」', async () => {
  assert.ok((await caseErrors(caseCard({ 其他类别描述: 'VIP课程' }))).some((e) => /只能填汉字/.test(e)));
  assert.ok((await caseErrors(caseCard({ 其他类别描述: '其它课程' }))).some((e) => /其他/.test(e)));
});
test('网购缺电商平台', async () => {
  const errs = await caseErrors(caseCard({}, ['电商平台']));
  assert.ok(errs.some((e) => /电商平台必填/.test(e)), errs.join());
  assert.deepEqual(await caseErrors(caseCard({ 销售方式: '实体店' }, ['电商平台'])), []);
});
test('处理单位不足三段', async () => {
  const errs = await caseErrors(caseCard({ 处理单位: '示例省/示例市' }));
  assert.ok(errs.some((e) => /三段/.test(e)), errs.join());
});
test('附件超限：数量、大小、格式', async () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.jpg`, size: 10 }));
  assert.ok((await caseErrors(caseCard(), five)).some((e) => /最多 4 个/.test(e)));
  assert.ok((await caseErrors(caseCard(), [{ name: 'big.mp4', size: 6 * 1024 * 1024 }])).some((e) => /5MB/.test(e)));
  assert.ok((await caseErrors(caseCard(), [{ name: 'a.docx', size: 10 }])).some((e) => /格式不支持/.test(e)));
  const bigB64 = 'A'.repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3));
  assert.ok((await caseErrors(caseCard(), [{ name: 'nosize.png', base64: bigB64 }])).some((e) => /5MB/.test(e)), '没传 size 也要拦');
});
test('举报人地址超过 40 字', async () => {
  const p = caseCard();
  p.fields.address = '鸭'.repeat(41);
  assert.ok((await caseErrors(p)).some((e) => /40 字/.test(e)));
});

let failed = 0;
for (const c of cases) {
  try {
    await c.fn();
    console.log(`✓ ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${c.name}\n  ${e.message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} 通过`);
process.exit(failed ? 1 : 0);
