---
name: fillduck
description: 填鸭 FillDuck：用本机资料卡 + 声明式配方，在浏览器里一次填对网页表单，且永不替用户提交。用于：帮我填网页表单 / 用资料卡自动填写 / 12315 举报填写（全国12315平台举报、jbcase）/ 把材料整理成资料卡或案件卡 / 陌生表单逐项填写 / scan 表单字段 / 把填过的表单沉淀为站点配方 / 校验配方或资料卡 / 12315 提交报「服务器出错了」「系统异常」排查。English triggers: fill web form, autofill form with profile, form filling recipe, scan form fields, generate site recipe, 12315 complaint form。不适用：注册账号、登录、填密码/银行卡/支付信息、付款下单、验证码、替用户点最终提交、iframe 或 shadow DOM 内的表单、纯接口批量提交或爬虫、12315 投诉流程（tscase，暂无配方）。
license: MIT
---

# 填鸭 FillDuck

引擎是一个自包含函数 `async function fillduck(input)`，与插件共用同一份。本 skill 目录下：

- `scripts/fillduck.js`：引擎源码（由项目 `scripts/sync.mjs` 生成的副本，只读，不要改）
- `scripts/recipes/*.json`：内置站点配方（目前只有 `12315-jubao.json`）
- `references/engine.md`：input/输出结构、动作词表与每个选项的准确语义（写配方前必读）
- `references/12315.md`：案件卡字段与示例、四步执行顺序

`input = { mode: 'run' | 'validate' | 'scan', profile, recipes, files, forceGeneric }`。`validate` 不碰 DOM，可在 Node 里跑；`run` 执行配方并逐字段核对；`scan` 只读字段清单。

**底线（任何情况都不破例）**
- 插件与本 skill 都不内置大模型，不需要、也不保存任何 API Key；资料卡只在本机，不上传、不写进仓库。
- 不点最终「提交」，除非用户在看过核对结果后明确说「提交」，且只点一次；任何时候都不点「上一步」。
- 不直接调用站点保存接口（12315 为 `/cuser/portal/jbcase/save`），不绕过页面控件写隐藏字段。
- 不填密码、银行卡、支付类信息，不过验证码，不替用户注册或登录。

## 1. 资料卡整理

资料卡 JSON：`{ "name", "type": "个人|公司|案件|自定义", "fields": {标准字段}, "custom": [{ "key", "label", "value" }] }`，所有值都是字符串。
标准字段键：`name 姓名 / mobile 手机 / email 邮箱 / address 详细地址 / province 省 / city 市 / district 区 / postcode 邮编 / company 公司名称 / creditCode 统一社会信用代码 / title 职位 / website 网址`。配方用 `{{键}}` 或 `{{显示名}}` 引用，也可写 `{{案件.举报内容}}`。

整理规则：
- 只写用户材料里有证据的事实（时间、金额、订单号、页面原话、沟通记录）；材料没有的留空并问用户，不推测、不补全。
- 不写情绪化、定性或攻击性用语（「骗子」「黑心」「无良」等），改为客观陈述发生了什么、依据是什么、诉求是什么。
- 遵守目标字段字数上限，超长由你压缩到上限内（保留时间、金额、关键事实，删形容词和重复），不依赖页面截断。按字符计数（`Array.from(s).length`），首尾空白不计。
- 自定义字段的键和显示名不能含「密码、口令、银行卡、信用卡号、cvv」等词，引擎会拒绝整张卡；「支付方式」「会员卡号」这类正常字段不受影响。

12315 案件卡上限（引擎校验 `12315.caseCard` / `12315.reporter`）：举报内容 1–400 字；详细地址 ≤40 字；其他类别描述、其他问题类别只能是汉字，且不含「其他」「其它」；销售方式为「网购」时电商平台必填（清单外手填 ≤20 字）；处理单位必须是「省/市/区局」三段，用 `/` 分隔，每段与页面选项文字完全一致；附件 ≤4 个、单个 ≤5MB、仅 jpg/jpeg/png/pdf/mp3/mp4。完整字段见 `references/12315.md`。

产出后必须校验，`ok: true` 才能用。`FD` 为本 skill 目录；第二个参数是资料卡文件（没有写 `-`），第三个是新配方文件（没有写 `-`，此时用内置配方），其后是附件路径：

```bash
FD=~/.claude/skills/fillduck; node -e '
const fs=require("fs"),p=require("path"),[d,pf,rf,...att]=process.argv.slice(1);
const fillduck=new Function(fs.readFileSync(d+"/scripts/fillduck.js","utf8")+";return fillduck")();
const rd=f=>JSON.parse(fs.readFileSync(f,"utf8")),rdir=d+"/scripts/recipes";
const recipes=rf&&rf!=="-"?[rd(rf)]:fs.readdirSync(rdir).filter(f=>f.endsWith(".json")).map(f=>rd(p.join(rdir,f)));
const profile=pf&&pf!=="-"?rd(pf):null,files=att.map(f=>({name:p.basename(f),size:fs.statSync(f).size}));
fillduck({mode:"validate",recipes,profile,files}).then(r=>{console.log(JSON.stringify(r,null,2));process.exit(r.ok?0:1)});
' "$FD" 案件卡.json - 截图1.png
```

看 `profileErrors`（格式）、`checks[].errors`（站点规则，含具体字数）、`recipes[].errors`（配方）。改到全部为空为止。

## 2. 站点配方执行

需要一个能在页面**主世界**执行 JS 的浏览器工具（如 javascript_tool 一类），因为配方要调用页面自己的全局函数。先确认：12315 页面上 `typeof window.showPlatform` 或 `typeof window.search` 应为 `"function"`；若页面明明有却返回 `"undefined"`，说明工具跑在隔离世界，换工具或改用插件。

**注入**（每次整页跳转后都要重注入）：先生成注入脚本，读出全文作为一次 JS 执行的代码传给浏览器工具。

```bash
FD=~/.claude/skills/fillduck; node -e '
const fs=require("fs"),d=process.argv[1],r=d+"/scripts/recipes/";
const rs=fs.readdirSync(r).filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync(r+f,"utf8")));
process.stdout.write(fs.readFileSync(d+"/scripts/fillduck.js","utf8")+"\nwindow.fillduck=fillduck;window.FILLDUCK_RECIPES="+JSON.stringify(rs)+";\"fillduck ready\"\n");
' "$FD" > <临时目录>/fillduck-inject.js
```

**调用**（工具支持顶层 await 就直接 await；否则返回 Promise 或 `JSON.stringify` 结果）：

```js
await fillduck({ mode: 'run', recipes: window.FILLDUCK_RECIPES,
  profile: { name: '示例案件', type: '案件', fields: { company: '示例鸭鸭文化传媒有限公司' }, custom: [ /* … */ ] },
  files: [ /* { name, type, size, base64 } */ ] })
```

附件以 base64 传入，引擎在页面内还原成 File 注入 `input[type=file]`。文件大、base64 塞不进一次调用时，改用浏览器工具自带的文件上传能力放进同一个文件框，再检查队列（12315 看 `#fileQueue > *` 数量）。

**读结果**：`ok`、`summary {ok, fail, skip}`、`recipe`/`step`/`final`、`hint`、`errors`；`results` 已按「失败 → 跳过 → 成功」排好，每项有 `label / status / reason / value / selector / note / candidates / actual`。
- `errors` 非空：配方或资料没通过校验，页面**没有任何改动**；按报错修资料卡再跑。
- `fail` + `candidates`：页面实际出现的候选项。挑出文字完全一致的一项；若含义有变化（例如换了类别），先问用户，再改资料卡重跑。
- `fail` + `actual`：写入后被页面联动改掉或清空，看顺序是否被破坏，按配方顺序重跑该步。
- `note` 提示「用了备用选择器」：填写成功但配方该更新了，告诉用户。
- `reason` 以「安全规则」开头：引擎拒绝点上一步/提交，属预期。
- `hint`：原样转述给用户（12315 最终步含三条避坑说明）。

## 3. 陌生表单（没有站点配方）

1. 注入后 `await fillduck({ mode: 'run', recipes: [], profile })` 跑通用配方：只填空字段，跳过密码/文件/只读框，不点任何按钮。
2. 结果里 `unmatched` 非空时，`await fillduck({ mode: 'scan', profile })` 取字段清单：每项含 `selector / tag / type / label / name / id / placeholder / required / value / options / editable / guess`。scan 不列 checkbox 和 radio，需要时用浏览器工具读页面结构。
3. 逐个判断：标签含义明确、资料卡里有证据的值 → 构造**单步临时配方**，用引擎动作填；含义不确定、资料卡没有、或涉及同意条款/声明类勾选 → 问用户，不猜。
4. 临时配方的 `match.host` 必须等于 `location.hostname`，`path` 是匹配 `location.pathname` 的正则。不要在临时配方里写提交类 `click`；如果这是表单最后一页，加 `"final": true` 和 `"submit"` 选择器，让引擎高亮并拦截提交。

```json
{ "id": "tmp-example", "name": "临时补填", "version": 1,
  "match": { "host": "form.example.com" },
  "steps": [ { "name": "补填", "path": "^/apply",
    "actions": [
      { "do": "fill", "label": "紧急联系人", "target": ["#emergencyName", "input[name=emergency]"], "value": "{{紧急联系人}}", "required": true },
      { "do": "select", "label": "所在城市", "target": ["#city"], "value": "{{市}}" }
    ] } ] }
```

调用：`await fillduck({ mode: 'run', recipes: [临时配方], profile })`。字段没有现成资料卡值时，经用户确认后加进资料卡 `custom` 再引用，而不是把值硬写进配方。跑完向用户逐项汇报：填了什么、依据、失败和未处理的字段。

## 4. 生成站点配方

填写成功且用户要求保存时，把实际用过、结果为 `ok` 的动作按执行顺序整理成配方（顺序就是依赖顺序）：
- 每个站点页面一个 step；最后一页 `final: true` 并写 `submit`。
- `target` 放 2 个以上候选选择器，稳定优先：`#id` → `[name=]` → 语义属性 → 结构路径。
- 值一律用 `{{资料卡字段}}` 模板；可选字段不加 `required`，按条件出现的动作加 `when`。
- 不写任何 JS；站点专用逻辑只能引用引擎已有的 `builtin`。会整页跳转的「下一步」按钮加 `"defer": true`。
- 动作与选项的准确语义见 `references/engine.md`。

最小模板：

```json
{ "id": "example-signup", "name": "示例报名表", "version": 1,
  "match": { "host": "form.example.com" }, "profileType": "个人",
  "steps": [ { "name": "报名信息", "path": "^/signup", "final": true,
    "actions": [
      { "do": "fill", "label": "姓名", "target": ["#realname", "input[name=realname]"], "value": "{{姓名}}", "required": true },
      { "do": "fill", "label": "手机", "target": ["#phone", "input[name=phone]"], "value": "{{手机}}", "required": true },
      { "do": "check", "label": "参会方式", "target": ["input[name=joinType]"], "value": "{{参会方式}}", "when": "{{参会方式}}" }
    ],
    "submit": ["button[type=submit]"] } ] }
```

用第 1 节命令校验（第二个参数填 `-` 或一张测试资料卡，第三个参数填新配方文件），`ok: true` 后再保存。保存位置由用户定；若在 fillduck 项目仓库里，放 `recipes/<id>.json`，再跑 `node scripts/sync.mjs` 与 `node scripts/selfcheck.mjs`。导入插件时插件会列出配方将调用的页面函数（`recipes[].calls`），提醒用户核对。

## 5. 提交前人工确认

最终步（结果 `final: true`）完成后：
1. 读回页面实际值，向用户列出每个字段的最终内容、失败/跳过项和 `hint`，失败项先处理完。
2. 明确问「是否提交」。只有用户明确同意（如「提交」「确认提交」）才点**一次**高亮的提交按钮；模糊回应、沉默、或同意的是别的事都不算。
3. 点击后不重复点，等页面结果并如实转述。
4. 任何阶段都不点「上一步」，不调用 save/submit 类接口，不用 fetch 直接发请求。

## 6. 12315 故障排查

- 四步 URL 必须按序走：`/cuser/portal/jbcase/notice`（须知）→ `corperation`（举报对象）→ `customer`（举报人）→ `information`（业务信息，最终步）。前三步的配方会自己点「同意/确认/下一步」（延迟点击），跳转后重注入再跑下一步。
- 不能跳步直接打开 information：会显示「系统异常」。从须知页重新开始。
- 提交或跳转后出现「服务器出错了」= 服务端会话已被消耗，不要刷新重试，从须知页重来。
- 业务信息页的「上一步」本身也会 POST save 并消耗会话，绝不点；要改前面步骤只能从须知页重来。
- 举报对象搜不到或命中多家：结果给出 `candidates`，把候选给用户选；按用户选定的信用代码更新 `creditCode` 后重跑。
- 网购选电商平台：微信要填「腾讯」（在「娱乐」页签）；清单里没有的平台走「其他」页签手填。
- 附件必须出现在 `#fileQueue` 里才算待上传；只给文件框赋值、队列没变化等于没传。
- 商品类别会清空举报问题类别，销售方式会清空处理单位：严格按配方顺序执行，单独补某个字段后要把它之后的依赖字段一起重跑（最稳妥是整步重跑）。
- 不要派发 `blur`（12315 实测教训）；引擎默认不派发，配方里不要加 `"blur": true`，手动操作也不要用派发 blur 的工具方法。
- 处理单位失败：`candidates` 是该级实际选项，把资料卡的三段改成完全一致的文字。
