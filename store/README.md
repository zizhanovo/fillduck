# 上架清单

两个商店都用同一个包：`dist/fillduck-extension.zip`（由 `node scripts/pack.mjs` 生成）。

国内用户打不开 Chrome 应用商店，所以 Edge 加载项商店同样要上，Chrome 用户也能从 Edge 商店的页面装。

## 先准备

| 要交的东西 | 在哪 |
| --- | --- |
| 插件包 | `dist/fillduck-extension.zip` |
| 图标 128×128 | `store/assets/icon128.png` |
| 截图 1280×800 ×4 | `store/assets/screenshot-1..4.png` |
| 宣传小图 440×280 | `store/assets/promo-440x280.png` |
| 中文文案、权限理由、数据声明 | `store/listing-zh.md` |
| 英文文案 | `store/listing-en.md` |
| 隐私政策网址 | `https://github.com/zizhanovo/fillduck/blob/main/docs/PRIVACY.md`（仓库要先推成公开） |

## Chrome 应用商店

1. 打开 https://chrome.google.com/webstore/devconsole ，用 Google 账号登录，付一次性 5 美元注册费。
2. 填「商家 / 非商家」声明。以公司名义发布就选商家，并填公司名称、地址、联系邮箱（欧盟数字服务法要求，会公开显示）。
3. 「新建项目」，上传 zip。
4. 按 `listing-zh.md` 填商品详情：名称、简介、详细说明、类别、语言，上传图标、截图、宣传小图。
5. 「隐私权规范」页：填单一用途说明、逐项权限理由、数据用途声明，勾选三项证明，填隐私政策网址。
6. 提交审核。一般几天；带可选的所有网站权限、又声明处理个人信息，可能更久。

## Edge 加载项商店

1. 打开 https://partner.microsoft.com/dashboard/microsoftedge ，用 Microsoft 账号注册，免费。
2. 「新建扩展」，上传同一个 zip。
3. 填写商品详情与隐私政策网址（内容同上，可直接复制中文文案）。
4. 提交审核，一般 1–7 个工作日。

## 更新版本

1. 改 `extension/manifest.json` 的 `version`（只能递增）。
2. 跑 `node scripts/pack.mjs`（会先跑自检、副本一致性检查和隐私扫描，任一不过就不出包）。
3. 在两个商店分别上传新 zip，填更新说明，提交审核。

## 自己先用（不经商店）

1. `node scripts/pack.mjs`
2. 解压 `dist/fillduck-extension.zip` 到一个不会被误删的文件夹。
3. Chrome 打开 `chrome://extensions`，右上角开「开发者模式」，点「加载已解压的扩展程序」，选那个文件夹。
4. 点工具栏拼图图标，把填鸭钉住；点图标打开侧边栏。

直接选仓库里的 `extension/` 目录也可以，效果一样，改完代码点一下「刷新」即可。
