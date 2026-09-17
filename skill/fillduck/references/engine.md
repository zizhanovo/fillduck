# 引擎参考（与 scripts/fillduck.js 0.1.0 对齐）

## input

| 键 | 说明 |
|---|---|
| `mode` | `run`（默认）/ `validate` / `scan` |
| `profile` | 资料卡对象，见 SKILL.md 第 1 节 |
| `recipes` | 配方数组。`run` 时取第一个「host 相等且某一步 path 命中」的配方和步骤；都不命中则跑通用配方 |
| `files` | 附件。`run` 需要 `{ name, type, base64 }`，建议带 `size`（没带时按 base64 长度估算）；`validate` 只需 `{ name, size }` |
| `forceGeneric` | `true` 时忽略站点配方，直接跑通用配方 |
| `validators` | 仅 `validate`：额外要跑的校验名数组，如 `["12315.caseCard"]` |

## 输出

- `validate`：`{ engine, mode, ok, recipes: [{ id, errors, calls }], profileErrors, checks: [{ validator, errors }] }`。
  资料卡给了时，对 `profileType` 等于资料卡 `type` 的配方，自动跑其各步的 `validate`。`calls` 是配方会调用的页面函数和内置动作。
- `scan`：`{ engine, mode, url, fields: [{ selector, tag, type, label, name, id, placeholder, autocomplete, required, value, options?, editable, guess }] }`。只列可见的 input/textarea/select，排除 hidden/submit/button/image/reset/checkbox/radio；密码框 `value` 恒为空。`guess` 是通用匹配猜的字段键。
- `run`：`{ engine, mode, url, ok, summary: { ok, fail, skip }, results, unmatched, recipe, recipeId?, step?, final, hint, errors? }`。
  `results` 按 fail → skip → ok 排序，每项 `{ i, do, label, status, reason?, value?, selector?, note?, candidates?, actual?, by? }`。`by` 是通用匹配的依据。
  资料卡格式错、配方校验错、或步骤 `validate` 不通过时，返回 `errors` 且不执行任何动作。

## 配方结构

- 顶层：`id`、`name`、`version`（整数）、`match.host`（字符串或数组，与 `location.hostname` 全等）、`profileType`（可选）、`steps`（非空）。
- 步骤：`name`、`path`（正则字符串，测 `location.pathname`）、`actions`、`final`（最终步）、`validate`（校验名）、`submit`（选择器数组，最终步只高亮不点）、`hint`（最终步返回时排在站点提示或「请人工核对后提交。」之后）。
- 动作按数组顺序执行，顺序就是依赖顺序。全部动作做完、再等 300ms 后统一核对，所以被后续联动清空的字段会在结果里变成 fail。

## 通用选项（所有动作）

| 选项 | 语义 |
|---|---|
| `label` | 结果里显示的名字 |
| `target` | 候选选择器数组。每轮按顺序试，直到 `timeout`；默认要求元素可见（`check`、`upload` 不要求）。用了非首个候选时结果带 `note` |
| `value` | 字符串，可含 `{{键或显示名}}` 模板（也可 `{{类型.字段}}`）；渲染后 trim。为空时：`required` → fail「缺少资料：字段」，否则 skip |
| `required` | 见上；`upload` 中表示没附件时 fail |
| `when` | 只支持 `{{字段}}`（非空）、`{{字段}}==值`、`{{字段}}!=值`；值不加引号，字段值先 trim。不满足则 skip |
| `timeout` | 毫秒，默认 3000，用于找元素和等候选 |

## 动作词表

| do | 必填 | 其他选项与行为 |
|---|---|---|
| `fill` | target, value | 原生 setter 写值并派发 `input`、`change`；支持 contenteditable；密码框 skip。`trigger`（页面函数名）+ `triggerArgs`（字面量数组，字符串可含模板）写值后调用；`blur: true` 才额外派发 blur；`verifyTarget` 指定核对读哪个元素；`verifyNonEmpty` |
| `check` | target | 有 `value` 时在该选择器命中的一组里，找 value 属性、标签文字、包裹 label 文字或紧随文字等于它的项；无 `value` 取第一个。`checked: false` 表示取消勾选。失败带 `candidates` |
| `select` | target, value | 原生下拉：先按选项文字全等，再按 option value；派发 input/change；支持 `trigger`/`triggerArgs`。失败带全部选项 |
| `typeAndPick` | target, options, value | 写值并派发 input/keyup/change，再调 `trigger`；在 `timeout` 内找 `options`（单个选择器字符串，可用逗号并列）中文字或 title 全等的可见项并点击；`settle` 点后等待（默认 200）；`verify: false` 关闭值核对；`verifyTarget`、`verifyNonEmpty`。失败带最多 40 个 `candidates` |
| `cascade` | target, levels, value | 点开 target，`value` 用 `/` 分隔，段数必须等于 `levels` 数；每级在对应选择器里点文字或 title 全等的项，`settle` 默认 250。核对：`verifyTarget`（或 target）的值按序包含每段；`verifyNonEmpty` |
| `click` | target 或 text | ① `target`+`value`：在命中元素里按文字/title 全等选一个（不要求可见）② 只有 `target`：点首个可见元素 ③ 只有 `text`：全页找文字全等的可见 a/button/[onclick]/label/li/span 等。`waitEnabled`（毫秒）等按钮可点；`defer: true` 延迟 50ms 点（会整页跳转的按钮必须用，否则结果回不来）；`settle` 点后等待 |
| `call` | fn | `fn` 为点分函数路径（如 `page.refresh`），不能是代码；`args` 字面量数组（字符串可含模板）；`settle` |
| `waitFor` | target 或 global | `target`：等元素可见，再按需等 `enabled: true`（无 disabled 属性和 disabled 类）、`notClass: "类名"`（该类消失）；`global: "a.b"`：等全局变量非空 |
| `upload` | target | 用 `files` 构造 File 赋给文件框并派发 input/change；`queue` 选择器：等其元素数增加附件个数，否则 fail「没有进入待上传队列」 |
| `builtin` | name | 内置具名动作：`12315.pickCompany`、`12315.platform` |

`verifyNonEmpty`：动作成功时，核对阶段检查每个选择器的第一个元素值非空，否则 fail「显示值与隐藏代码不一致」。

校验名：`12315.reporter`（详细地址 ≤40 字）、`12315.caseCard`（见 12315.md）。

## 引擎强制的安全规则

- `click` 目标文字含「上一步 / 返回上一 / 上一页」一律拒绝（所有步骤）。
- 最终步里，`click` 目标属于 `submit`，或文字含「提交 / 保存 / 确认举报 / 确认投诉」，拒绝。
- 最终步里，`call` 的 `fn` 或任何动作的 `trigger` 含 save / submit / prev / back（不分大小写），拒绝。
- 通用配方不点击任何元素，只填空字段，跳过密码框、文件框、只读或禁用框。
- 配方里不允许任何代码：`fn`、`trigger`、`global` 必须是标识符路径，`args`、`triggerArgs` 只能是字面量。
