# 上架清单

三个商店，两个包。

| 商店 | 传哪个包 | 费用 | 覆盖谁 |
| --- | --- | --- | --- |
| Chrome 应用商店 | `dist/fillduck-extension.zip` | 一次性 5 美元 | Chrome 用户 |
| Edge 加载项商店 | `dist/fillduck-extension.zip`（同一个包） | 免费 | Edge 用户，以及国内打不开 Chrome 商店的 Chrome 用户 |
| Firefox AMO | `dist/fillduck-firefox.zip` | 免费 | Firefox 桌面版 |

Chrome 与 Edge 都是 Chromium，共用同一个包。Firefox 那份由 `node scripts/build-firefox.mjs` 从同一份源码生成，两边只差 `manifest.json`：侧边栏从 `side_panel` 换成 `sidebar_action`，后台从 `service_worker` 换成事件页，权限去掉 `sidePanel`。插件代码一份都不改。

国内用户打不开 Chrome 应用商店，所以 Edge 加载项商店同样要上，Chrome 用户也能从 Edge 商店的页面装。

## 先准备

| 要交的东西 | 在哪 | 谁要 |
| --- | --- | --- |
| 插件包 | `dist/fillduck-extension.zip` | Chrome、Edge |
| Firefox 包 | `dist/fillduck-firefox.zip` | AMO |
| 商店徽标 1:1 | `store/assets/icon128.png`（128×128，够 Edge 的最低要求），建议另出一张 300×300 | Edge |
| 图标 128×128 | `store/assets/icon128.png` | Chrome |
| 截图 1280×800 | `store/assets/screenshot-1..4.png`（4 张已出） | Chrome 至少要 1 张；Edge、AMO 可选但强烈建议 |
| 宣传小图 440×280 | `store/assets/promo-440x280.png`（已出） | Chrome、Edge 的可选项 |
| 中文文案、权限理由、数据声明 | `store/listing-zh.md` | 三家 |
| 英文文案 | `store/listing-en.md` | 做英文区时用 |
| 隐私政策网址 | `https://github.com/zizhanovo/fillduck/blob/main/docs/PRIVACY.md`（仓库要先推成公开） | 三家都要 |

素材都由 `store/assets/source/` 下的脚本渲染，改完重跑即可：`render-icons.mjs` 出图标、`render-promo.mjs` 出 440×280 宣传图、`shots.mjs` 出四张 1280×800 截图。Edge 要的 300×300 商店徽标目前还没出——现用的 `icon128.png` 是 128×128，够 Edge 的最低要求，想要更清楚就往 `render-icons.mjs` 的 jobs 里加一条 300。

素材都已生成（生成脚本在 `store/assets/source/`，改完重跑即可）。`node scripts/pack.mjs` 出包时会打印还缺哪些素材。

## Chrome 应用商店

1. 打开 https://chrome.google.com/webstore/devconsole ，用 Google 账号登录，付一次性 5 美元注册费。
2. 填「商家 / 非商家」声明。以公司名义发布就选商家，并填公司名称、地址、联系邮箱（欧盟数字服务法要求，会公开显示）。
3. 「新建项目」，上传 zip。
4. 按 `listing-zh.md` 填商品详情：名称、简介、详细说明、类别、语言，上传图标、截图、宣传小图。
5. 「隐私权规范」页：填单一用途说明、逐项权限理由、数据用途声明，勾选三项证明，填隐私政策网址。
6. 提交审核。一般几天；带可选的所有网站权限、又声明处理个人信息，可能更久。

## Edge 加载项商店

1. 打开 https://partner.microsoft.com/dashboard/microsoftedge ，用 Microsoft 账号注册，免费。
2. 「创建新扩展」，上传 `dist/fillduck-extension.zip`。包会先过一遍校验，报错就修完重传。
3. **可用性**：可见性选 `Public`（默认）；市场默认全部，也可以只留几个。
4. **属性**：填类别、网站、支持联系人；「隐私策略要求」选「是」并填上面那条隐私政策网址。
5. **隐私**（新版是独立分步页，2026 年 5 月底前全量）：
   - **单一用途**：抄 `listing-zh.md` 的「单一用途说明」。
   - **权限理由**：Edge 会把 manifest 里的权限列出来逐个要理由，照 `listing-zh.md` 的权限理由表抄。注意 Chrome/Edge 这份包里才有 `sidePanel`，Firefox 那份没有。
   - **你使用的是远程代码吗**：选「否，我没有使用远程代码」。MV3 本来就不允许远程代码。
   - **数据使用量**：勾选适用的类型并逐条证明。
   - **隐私策略 URL**：填上面那条。
6. **Microsoft Store 一览**：每种语言都必须填「说明」（**最少 250 字符，最多 10000**）和「扩展徽标」（1:1，建议 300×300，最小 128×128）。**扩展名称和简短说明来自 manifest 的 `name` / `description`，是只读的**，要改就得改 manifest 再重传包。截图（640×480 或 1280×800，最多 6 张）和促销磁贴都是可选项。
7. 提交并填认证说明。认证一般 1–7 个工作日。

## Firefox AMO

1. 打开 https://addons.mozilla.org/developers/ ，用 Firefox 账号登录，免费。
2. 「提交新附加组件」→ 选在 AMO 上架 → 上传 `dist/fillduck-firefox.zip`。
3. AMO 先自动校验再人工审核，流程见 https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ 。
4. 填栏位：Summary 抄 `listing-zh.md` 的「简介」，Description 抄「详细说明」（AMO 支持 Markdown，直接粘），类别选 Productivity，许可选 MIT。
5. 通过后 AMO 给包签名并自动发布，之后可以随时推新版本。

### 这个包里两条 AMO 的硬要求（已写进 manifest）

- **扩展 ID**：MV3 扩展 AMO 不给分配 ID，必须自带。现在是 `fillduck@zizhanovo.github.io`，写在 `scripts/build-firefox.mjs` 的 `GECKO_ID`。**上架后不要再改**——改了等于换一个扩展，老用户再也收不到更新。
- **数据收集申报**：AMO 从 2025-11-03 起要求每个新提交申报收集与传输的数据类型。填鸭不发网络请求、资料只存本机，所以是 `{"required": ["none"]}`。哪天真开始往外传数据，这个常量必须同步改，否则就是对商店做虚假申报。
- `strict_min_version` 定在 `140.0`，由 `data_collection_permissions` 的最高要求决定（`optional_host_permissions` 只要 128）。侧边栏是桌面特性，包不声明 `gecko_android`，所以 AMO 上只对桌面版 Firefox 提供。

### 本地验收

```bash
npx web-ext lint --source-dir dist/firefox
```

已经跑过：**0 error**。会剩一条 Android 告警，因为没声明 `gecko_android`，不是漏配。

不上 AMO 也能先自己试：Firefox 打开 `about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ 选 `dist/firefox/manifest.json`。临时载入重启即失效，正式安装必须等 AMO 签名。

## 更新版本

1. 改 `extension/manifest.json` 的 `version`（只能递增）。Firefox 包的版本号从同一个地方来，不用改两遍。
2. 跑 `node scripts/pack.mjs`（会先跑自检、副本一致性检查和隐私扫描，任一不过就不出包；顺带把 Firefox 包也生成出来）。
3. 在三个商店分别上传对应的新 zip，填更新说明，提交审核。

## 自己先用（不经商店）

1. `node scripts/pack.mjs`
2. 解压 `dist/fillduck-extension.zip` 到一个不会被误删的文件夹。
3. Chrome 打开 `chrome://extensions`，右上角开「开发者模式」，点「加载已解压的扩展程序」，选那个文件夹。
4. 点工具栏拼图图标，把填鸭钉住；点图标打开侧边栏。

直接选仓库里的 `extension/` 目录也可以，效果一样，改完代码点一下「刷新」即可。

Firefox 用 `dist/firefox/` 目录（`about:debugging` 临时载入），步骤见上面。
