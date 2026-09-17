# 填鸭 FillDuck 隐私政策

最后更新：2026-09-17

填鸭 FillDuck（以下简称「本插件」）是一个帮你把常用资料填进网页表单的浏览器插件。**本插件不收集、不上传、不出售你的任何数据。**

## 一句话

你的资料只存在你自己电脑的浏览器里，只在你点「一口填完」的那一刻，被写进你当前打开的那个网页。

## 本插件保存什么

保存在你本机浏览器的存储区（`chrome.storage.local`），不会同步到任何服务器：

- **资料卡**：你自己填写的姓名、手机、邮箱、地址、公司信息，以及你添加的自定义字段。
- **界面偏好**：当前选中的是哪张资料卡。

**附件**只存在侧边栏的内存里，关掉侧边栏就没了，不写入存储、不上传。

卸载插件时，浏览器会一并删除这些数据。你也可以随时在插件里删除资料卡，或用「导出」把数据拿走。

## 本插件不保存、也不接受什么

- 不提供密码、银行卡号、支付密码类字段，检测到这类字段名会拒绝保存整张资料卡。
- 填写时不会向网页上的密码框写入任何内容。

## 数据发往哪里

哪里都不发。本插件没有后端服务器，不发起任何网络请求，不含任何统计、广告或追踪代码，也不包含任何远程代码。

唯一的数据流动是：你点击「一口填完」后，所选资料卡里的值被写进你当前标签页的表单控件。这和你自己用键盘打字的效果一样。

## 权限为什么需要

- **在你访问的网站上读取和更改数据（`activeTab`、可选的所有网站权限）**：只有你点「一口填完」时，才会向当前标签页注入填写脚本。不点就不注入。插件不会在后台读取网页内容。12315（`www.12315.cn`）是内置站点，已随插件申请；其他网站在你第一次使用时由你授权。
- **`scripting`**：用于在你点击时注入填写脚本。
- **`storage`、`unlimitedStorage`**：用于在本机保存资料卡。
- **`sidePanel`**（Chrome / Edge）：用于显示插件的侧边栏界面。Firefox 上侧边栏由 `sidebar_action` 声明，不需要单独的权限。

## 儿童

本插件不面向 13 岁以下儿童，也不会有意收集儿童信息。

## 变更

本政策如有修改，会更新本页顶部的日期，并在插件的版本更新说明中注明。

## 联系

问题、疑问或建议：在 https://github.com/zizhanovo/fillduck 提交 issue。

---

# Privacy Policy (English)

Last updated: 2026-09-17

FillDuck is a browser extension that fills web forms with information you saved yourself. **It does not collect, transmit, or sell any of your data.**

**What is stored:** the profile cards you create (name, phone, email, address, company details, and any custom fields) and which card is selected. They are stored locally in your browser (`chrome.storage.local`) and never leave your device. Attachments live only in the side panel's memory and are discarded when it closes.

**What is never stored:** passwords, bank card numbers, and payment credentials. The extension refuses to save a profile card containing such fields and never writes into a password input.

**Where data goes:** nowhere. FillDuck has no server, makes no network requests, and contains no analytics, ads, tracking, or remote code. The only data movement is from your selected profile card into the form on the tab you are viewing, at the moment you click "一口填完" (Fill it all).

**Permissions:** `activeTab` and the optional all-sites permission are used solely to inject the filling script into the current tab when you click the button; `scripting` to inject it; `storage` and `unlimitedStorage` to keep your cards locally; `sidePanel` (Chrome/Edge) to show the side panel, while on Firefox the sidebar is declared with `sidebar_action` and needs no separate permission.

**Contact:** open an issue at https://github.com/zizhanovo/fillduck
