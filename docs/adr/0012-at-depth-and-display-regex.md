# ADR-0012 at_depth 世界书注入与 display_only 正则落地

日期：2026-11-18  
状态：已采纳（M2）  
关联：`docs/xuyueji_kickoff/ENGINE_SPEC.md`、`PRODUCT_SPEC.md` F08/F11

## 背景

世界书条目早已支持 `position: "at_depth"`，但只存不用：Prompt 编译器把所有世界书
内容一律拼进 systemPrompt，`depth` 字段也没有进入规则与编辑器。正则的
`display_only` 阶段同样只登记不执行，M2 Gate 的「插入深度」与「展示阶段」仍是缺口。

## 决策

### at_depth 注入

1. 条目规则新增 `depth`（0–50，默认 0），随 `rule_jsonb` 持久化，编辑器在
   `position = at_depth` 时显示「插入深度（从对话末尾数）」。
2. Prompt 编译器把 `at_depth` 条目从 systemPrompt 中排除，改为注入消息列表：
   - 深度按「从末尾数」计算：`index = messages.length - depth`，夹在 `[0, length]`；
     depth 0 表示紧跟在最后一条用户输入之后。
   - 注入内容使用 `role: "user"` 并加 `[世界书设定：<entryId>]` 前缀，**不使用 system**：
     世界书是用户内容，不能获得平台策略的身份。
   - 同一深度按 `insertionOrder`、`id` 稳定排序；digest 包含注入后的消息，改变深度会
     改变 digest。
3. 预算不变：`at_depth` 条目仍参与世界书条目/字节/token 限额与 Prompt 组件的
   整体裁剪；未进入预算的条目不注入。

### display_only 正则

1. 浏览器端用同一 `applySafeRegex`（`@xuyueji/tavern-core`）对已保存的消息文本做
   展示层替换，不写回数据库、不影响 Prompt。
2. 仅执行 `enabled && stage === "display_only"` 的规则；任一规则超限或表达式非法时
   停止该条消息的展示替换并保留当前文本，渲染不崩。
3. Prompt 预览仍把这类规则列在 `regex.deferred`，并注明 `client_display_only`，
   避免用户误以为它们改变了模型输入。

## 影响

- 世界书终于能按酒馆习惯「插到对话深处」，而不是全部堆在 system prompt。
- 展示正则是纯前端变换：导出/另一设备看到的是原始文本，导出数据不受展示规则污染。
- 仍未支持：`model_output` 阶段（等 M3 模型运行时）、按角色/会话作用域启用正则、
  世界书条目级 token 预算单独配置。
