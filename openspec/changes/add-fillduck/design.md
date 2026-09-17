## Context

动机见 proposal.md。有两类输入约束这套设计。

**12315 实测经验**（2026-09-17，已登录，实际提交成功过一次）：
- 老站点靠全局函数加自研组件工作，直接写隐藏代码字段虽然能提交，但显示层、联动显隐、校验规则都不会跟着变。
- 必须「调用页面函数，或者点击它自己的候选项」。
- 字段之间有清空依赖。
- 第 3 步的「上一步」和保存请求会消耗服务端会话。

已验证的 DOM 路径：

| 字段 | 实测路径 |
|---|---|
| 须知 | `#agree` 倒计时后可点 |
| 第 1 步 | `#searchBox` → `search()` → `a[onclick^=toDetail]` → `#corperationSave` |
| 第 2 步 | `#provideraddr` → `#customerSubmit` |
| 商品类别 | `#xffwlx` 写值 → `handleXffwlxInput()` → `#xffwlxUl li` |
| 销售方式 | `#xsfsliDiv a`（会清空处理单位） |
| 电商平台 | `showPlatform()` → 等 `dspt_data_map` 加载 → `.dspt_tab[value=lb]` → `.dspt_data_wrap>[value=ptcode]` → `.check-item[value]` → `#dsptrzsh_text` → `dspt_submit_toggle()` → `#dspt_submit_btn` |
| 举报类别 | `#tswtlx` 写值 → `handtswtlxInput()` → 精确匹配的 `li`（会清空处理单位） |
| 处理单位 | `#cldwdiv .city-picker-span` → `.city-select.province/city/district a[title]` |
| 举报内容 | `#tsnr` → `words_deal()` |
| 附件 | `DataTransfer` → `input[type=file]` → 派发 `change` |

**开源借鉴**（只借思路，代码全部自写）：
- map-the-web（GPL）：「host/path → 字段候选选择器 → next/submit 动作」的骨架，以及选择器稳定性的优先级。
- Form-O-Fill（MIT）：只填空字段、按步骤串联。
- page-agent（MIT）：按 URL 注入站点专用能力。
- Fake Filler（MIT）：可比对的属性范围。

## Goals / Non-Goals

**Goals:**
- 引擎只有一份：`engine/fillduck.js`，由插件、skill、示范页生成器共用。
- 配方是纯数据，普通人也能看懂；站点专用的复杂逻辑收敛到少量内置具名动作里。
- 零依赖、零构建，解压即可装。

**Non-Goals:**
- 插件里不内置大模型，陌生表单交给 agent skill 处理。
- 不做云同步、不做加密保险库、不做账号体系。
- 不支持 iframe 和 shadow DOM 内的表单（首版）。
- 不做 12315 投诉流程（tscase），留作第二份配方。
- 不上架应用商店。

## Decisions

### 1. 引擎的形态：一个自包含函数

引擎是 `async function fillduck(input)`，内部不引用任何外部变量。

- 插件通过 `chrome.scripting.executeScript({ world: 'MAIN', func: fillduck, args: [input] })` 按需注入。必须用 MAIN world，才能调用页面的全局函数。
- skill 把源码交给 agent 粘贴执行。
- `input` 的结构是 `{ mode: 'run' | 'validate' | 'scan', profile, recipes, files, forceGeneric }`：
  - `validate` 只校验配方和资料，不碰 DOM，供 Node 自检和示范页使用；
  - `scan` 只读，返回页面上的字段清单，供 agent 处理陌生表单。
- 备选方案是常驻 content script 加消息通信：它每个页面都会注入，还拿不到页面全局函数，所以不选。

### 2. 配方格式

以 map-the-web 为骨架，JSON 结构如下：

```json
{ "id": "12315-jubao", "name": "12315 举报", "version": 1,
  "match": { "host": "www.12315.cn" },
  "profileType": "案件",
  "steps": [
    { "name": "业务信息", "path": "^/cuser/portal/jbcase/information", "final": true,
      "validate": "12315.caseCard",
      "actions": [
        { "do": "fill", "target": ["#spmc"], "value": "{{商品名称}}", "required": true },
        { "do": "typeAndPick", "target": ["#xffwlx"], "trigger": "handleXffwlxInput",
          "options": "#xffwlxUl li", "value": "{{商品类别}}", "required": true },
        { "do": "builtin", "name": "12315.platform", "when": "{{销售方式}}==网购" }
      ],
      "submit": ["input.submit-btn"] } ] }
```

- **动作词表**：`fill`、`check`、`select`、`typeAndPick`、`cascade`、`click`、`call`（只按名字调用页面上已存在的函数，参数必须是字面量或模板）、`waitFor`、`upload`、`builtin`（调用引擎内置的站点专用动作）。
- **动作顺序就是依赖顺序**，不另设 `dependsOn`：顺序写对就够了（YAGNI）。核对阶段会暴露被清空的字段。
- **内置具名动作**：`12315.platform` 放在引擎的一个注册表里。为什么不允许配方里写 JS：MV3 禁止远程代码，而用户导入的配方属于不可信输入。

### 3. 资料卡模板

模板语法 `{{字段显示名或键}}`，在资料卡的标准字段和自定义字段里按「键 → 显示名」查找。

条件语法 `when` 只支持 `==` / `!=` / 非空三种。这是故意简化的：

```js
// ponytail: 天花板是不支持与或逻辑；升级路径是引入小型表达式解析器，禁止使用 eval
```

### 4. 通用匹配

按优先级逐个尝试：
1. `autocomplete` 标准值；
2. `<label for>`、包裹的 label、同行左侧文字；
3. `name` / `id` / `placeholder` / `aria-label` 命中中英文关键词表。

关键词表参考 Chromium 的 autofill 字段类型自己编写，并补充中文词。每个标准字段对应一组正则。只填可见、可编辑、当前为空的元素。

### 5. 写值方式

- 先用原生 value setter 写值，再派发 `input` 和 `change` 事件，兼容 React、Vue 等受控组件。
- jQuery 站点通过 `call` 触发它自己的处理函数。
- 12315 的教训是不要派发 `blur`，所以引擎默认不派发，只有动作显式声明时才派发。

### 6. 存储

- 资料卡和用户导入的配方都存在 `chrome.storage.local`，并申请 `unlimitedStorage`。
- 内置配方随插件打包，只读。
- 附件只放在侧边栏内存里，转成 base64 经 `args` 传给页面，在页面内还原成 `File`。

### 7. 插件形态与权限

- 采用侧边栏形态：文件选择框不会把它关掉，翻页时也一直开着。
- 权限：`sidePanel`、`scripting`、`storage`、`unlimitedStorage`、`activeTab`。
- 通用配方要能在任意站点运行，所以 `optional_host_permissions: ["<all_urls>"]`，首次在新站点使用时由用户授权。
- 12315 作为内置站点，直接写进 `host_permissions`。

### 8. skill 副本

`scripts/sync.mjs` 把 `engine/` 和 `recipes/` 复制到 `skill/fillduck/scripts/`，`--check` 模式校验两边一致。不用软链接，因为 skills-manager 复制安装后软链接会断。

### 9. 示范页

单个 HTML 文件，内联引擎源码，只调用它的 `validate` 模式，把校验规则用在生成器上。发布前由 `sync.mjs --check` 一并检查。两个 zip 作为附件文件一起发布。

## Risks / Trade-offs

- [目标站改版导致配方失效] → 每个动作都支持多个候选选择器；失败时报告具体动作和选择器，配方有版本号。
- [通用匹配填错字段] → 只填空字段；结果逐项列出「填了什么、依据是什么」，用户能一眼核对；不自动提交。
- [资料卡明文存储] → 界面明确提示；不提供密码、银行卡类字段；数据不出本机。
- [`call` 动作可调用页面函数] → 只能调用页面上已存在的具名函数，参数不能是代码；导入第三方配方时显示将调用的函数清单，用户确认后才保存。
- [`<all_urls>` 权限让用户不放心] → 设为可选权限，按站点在用户操作时授权；插件没有任何后台读取。
- [名称撞车] → `rockbenben/fillduck` 领域不同且没有星；上架商店前再复查。

## Migration Plan

新项目，无需迁移。交付物：
- 插件 zip 放在示范页上供下载；
- skill 在本机通过 skills-manager 安装；
- 示范页以 Artifact 私有发布，由用户决定是否分享。
