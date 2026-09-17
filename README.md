# 填鸭 FillDuck

资料存一次，表单填一口。

填鸭是一个 Chrome 侧边栏插件加一个 agent skill：把姓名、电话、公司、案件等信息存成本机资料卡，打开表单点「一口填完」，按「配方」调用页面自己的控件把表单填对，逐字段告诉你哪些填上了。**任何配方都不会替你点最终提交。**

- **通用配方**：任意网站，按 autocomplete、标签文字、中英文关键词匹配输入框；只填空着的框，不碰密码框和文件框。
- **站点配方**：针对老式政务站点，声明式地写清每一步的字段、顺序和组件动作。首份配方是「全国12315 举报」。
- **agent skill**：没有配方的陌生表单交给浏览器 agent 读页面来填，填成功后可以沉淀成新配方。插件本身不内置大模型，不存 API Key。

## 目录

```
engine/fillduck.js        填写引擎（唯一源文件，自包含函数）
recipes/*.json            内置站点配方（唯一源文件）
extension/                Chrome MV3 侧边栏插件（vendor/ 为同步生成的副本）
skill/fillduck/           agent skill（scripts/ 为同步生成的副本）
demo/index.html           公开示范页（内联引擎与配方，由同步写入）
scripts/selfcheck.mjs     Node 自检（配方与资料卡校验用例）
scripts/sync.mjs          把引擎和配方同步到插件、skill、示范页
test/fixtures/            本地测试页与测试配方
store/                    商店文案、权限理由与素材（见 store/README.md）
docs/PRIVACY.md           隐私政策（商店要求的公开页面）
```

## 安装插件

1. 下载并解压 `fillduck-extension.zip`（或直接用仓库里的 `extension/` 目录）。
2. 打开 `chrome://extensions`，右上角打开「开发者模式」。
3. 点「加载已解压的扩展程序」，选择解压出来的目录。
4. 点工具栏的填鸭图标打开侧边栏，新建或导入资料卡。

资料卡以明文保存在本机浏览器（`chrome.storage.local`），不要存密码和银行卡。附件只在侧边栏内存里，关掉就没了。首次在 12315 以外的网站使用时，Chrome 会请求该网站的访问授权；插件只在你点按钮时注入脚本，不发任何网络请求。

## 安装 skill

把 `skill/fillduck/` 目录（或 `fillduck-skill.zip` 解压后的目录）放进 agent 的 skills 目录，或用 skills-manager 安装。用法见 `skill/fillduck/SKILL.md`。

## 配方写法

```json
{
  "id": "example-site",
  "name": "示例站点报名",
  "version": 1,
  "match": { "host": "www.example.com" },
  "profileType": "个人",
  "steps": [
    {
      "name": "报名表",
      "path": "^/signup",
      "final": true,
      "actions": [
        { "do": "fill", "target": ["#name", "input[name=realname]"], "value": "{{姓名}}", "required": true },
        { "do": "typeAndPick", "target": ["#city"], "options": ".suggest li", "value": "{{市}}" },
        { "do": "check", "target": ["input[name=gender]"], "value": "{{性别}}", "when": "{{性别}}" }
      ],
      "submit": ["button[type=submit]"]
    }
  ]
}
```

- `match.host` 匹配主机名，`steps[].path` 是匹配路径的正则；`final: true` 的步骤只高亮 `submit` 按钮，不点击。
- `value` 用 `{{字段}}` 引用资料卡，按「标准字段键 → 标准字段显示名 → 自定义字段键 → 自定义字段显示名」查找。
- `target` 可以写多个候选选择器，按顺序尝试。动作的书写顺序就是执行顺序，有联动清空的字段要排在后面。
- `when` 只支持 `{{字段}}`（非空）、`{{字段}}==值`、`{{字段}}!=值`。
- 动作：`fill` 写文本、`check` 勾选、`select` 原生下拉、`typeAndPick` 输入后点候选项、`cascade` 层级选择、`click` 点击、`call` 调用页面上已有的具名函数、`waitFor` 等待、`upload` 注入附件、`builtin` 调用引擎内置的站点专用动作。
- 配方里不能写代码。站点专用的复杂逻辑放进引擎的内置动作（如 `12315.platform`）。

## 开发命令

```bash
node scripts/selfcheck.mjs
```

```bash
node scripts/sync.mjs
```

```bash
node scripts/sync.mjs --check
```

```bash
node scripts/pack.mjs
```

改了 `engine/` 或 `recipes/` 后先运行 `sync`，提交前运行 `selfcheck` 和 `sync --check`。`pack` 会把这几道检查连同隐私扫描、图标尺寸一起跑一遍，全过才出包。本地测试页：在仓库根目录起静态服务，打开 `test/fixtures/form.html`（全部动作）和 `test/fixtures/generic.html`（通用配方）。

## 许可与借鉴

本项目采用 MIT 许可，代码全部自写。设计上借鉴了以下项目的思路，未拷贝其代码或数据：

- map-the-web（GPL）：「站点路径 → 字段候选选择器 → 下一步动作」的配方骨架与选择器稳定性优先级。
- Skyvern（AGPL）：浏览器 agent 处理陌生表单的流程。
- Form-O-Fill（MIT）：只填空字段、按步骤串联。
- page-agent（MIT）：按 URL 注入站点专用能力。
- Fake Filler（MIT）：可比对的输入框属性范围。

站点配方依赖目标网站当前的页面结构，网站改版后需要更新配方。
