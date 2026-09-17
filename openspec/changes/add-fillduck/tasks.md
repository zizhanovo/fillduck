## 1. 引擎核心

- [x] 1.1 建立 `engine/fillduck.js` 骨架与 `mode: 'validate'`，覆盖配方格式校验（未知动作、缺字段、非法 when）和模板解析；新建 `scripts/selfcheck.mjs`，用 Node 跑合规配方、非法动作、字段缺失三类用例，确认全部通过
- [x] 1.2 实现动作词表（fill/check/select/typeAndPick/cascade/click/call/waitFor/upload/builtin）、多候选选择器、逐字段核对和最终步高亮提交按钮（不点击）；在本地测试页 `test/fixtures/form.html` 上用浏览器跑一份覆盖全部动作的配方，确认结果与预期一致
- [x] 1.3 实现通用匹配（autocomplete → label → 关键词表，中英文），只填空字段、跳过密码/隐藏/文件框；实现 `mode: 'scan'`；在 `test/fixtures/generic.html`（含中文标签、已有内容字段、密码框）上验证填充与跳过结果

## 2. 12315 站点配方

- [x] 2.1 编写 `recipes/12315-jubao.json` 与内置动作 `12315.platform`，以及案件卡校验 `12315.caseCard`；在 selfcheck 中加入 410 字、非汉字其他描述、网购缺平台、处理单位不足三段、附件超限等用例，确认全部通过
- [ ] 2.2 在已登录的真实 12315 页面，用引擎从须知页走到业务信息页：核对结果全部成功，附件进入待上传队列，网络请求中没有 `jbcase/save`；最后离开页面，不提交

## 3. Chrome 插件

- [x] 3.1 编写 `extension/manifest.json`（MV3、侧边栏、按 design 申请权限）及构建前同步（把 engine 和 recipes 复制进 extension）；在 `chrome://extensions` 加载后确认无报错
- [x] 3.2 编写侧边栏：资料卡列表与编辑（标准字段加自定义字段）、复制、删除确认、导入导出、附件选择、「一口填完」、结果列表（失败项置顶）；重开侧边栏确认数据仍在，导入非法文件时有提示
- [ ] 3.3 可选主机权限流程：在一个普通网站首次点击时请求授权，用通用配方填写本地测试页；在 12315 真实页面用插件完成四步填写，不提交

## 4. Agent skill

- [x] 4.1 编写 `skill/fillduck/SKILL.md`（200 行以内）：资料卡整理、站点配方执行、scan 模式处理陌生表单、生成配方、人工确认提交、12315 故障排查
- [x] 4.2 编写 `scripts/sync.mjs`，把 engine 和 recipes 复制到 skill 与 extension；确认 `--check` 在副本一致时通过、被篡改时失败
- [x] 4.3 通过 skills-manager 在本机安装 skill，确认 agent 的可用 skill 列表中出现 fillduck

## 5. 公开示范页

- [x] 5.1 打包 `dist/fillduck-extension.zip` 和 `dist/fillduck-skill.zip`，解压后确认文件完整
- [x] 5.2 编写示范页：虚构 12315 案例、内联引擎的案件卡生成器（字数统计、校验、复制和下载）、安装步骤、四步流程、避坑清单、配方示例讲解、下载区；在桌面和手机宽度下确认没有横向滚动，并检查页面文本中没有真实案件关键词
- [ ] 5.3 以 Artifact 形式发布示范页（默认私有）并附上两个 zip，确认下载可用

## 6. 收尾

- [x] 6.1 编写 `README.md`（定位、结构、安装、配方写法、自检与同步命令、许可与借鉴声明）和 `LICENSE`（MIT）；运行 selfcheck、`sync --check`、`openspec validate add-fillduck`，确认全部通过
