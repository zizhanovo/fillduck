## Purpose

定义 FillDuck 的 agent skill：让浏览器 agent 复用同一个填写引擎和资料卡，站点配方覆盖不到的表单由 agent 来填，并能沉淀出新配方。

## ADDED Requirements

### Requirement: 与插件共用引擎
skill SHALL 附带与插件完全一致的引擎和内置配方，并说明如何把它们注入页面执行；项目 SHALL 提供一致性检查。

#### Scenario: 副本不一致
- **WHEN** 插件内的引擎被修改，而 skill 中的副本没有同步
- **THEN** 一致性检查失败

### Requirement: 陌生表单处理
页面没有站点配方且通用配方有未匹配字段时，skill SHALL 指导 agent 阅读页面字段，从资料卡中选择对应值，用引擎的动作词表逐个填写，并汇报结果。

#### Scenario: 通用配方漏填
- **WHEN** 通用配方报告有 3 个输入框未匹配
- **THEN** agent 逐个判断，可以填的用引擎动作填写，不确定的询问用户

### Requirement: 生成站点配方
skill SHALL 指导 agent 在成功填写某个站点后，把用过的动作整理成符合配方格式的站点配方，并通过引擎的配方校验。

#### Scenario: 输出新配方
- **WHEN** agent 在新站点上填写成功，用户要求保存配方
- **THEN** 产出一份能通过配方校验的配方文件

### Requirement: 资料整理与内容约束
从用户材料生成资料卡时，skill SHALL 要求只写有证据的事实，不写情绪化用语，遵守目标字段的字数限制；超长内容由 agent 压缩，不依赖页面截断。

#### Scenario: 材料超出字数
- **WHEN** 整理后的内容超过目标字段上限
- **THEN** agent 先压缩到上限以内再填写

### Requirement: 提交前人工确认
skill SHALL 要求 agent 在最终步完成后向用户展示核对结果，得到用户明确同意后才点一次提交；SHALL 禁止 agent 点击「上一步」或直接调用保存接口。

#### Scenario: 用户未同意
- **WHEN** 最终步已填完，但用户还没有明确同意提交
- **THEN** agent 不点击提交
