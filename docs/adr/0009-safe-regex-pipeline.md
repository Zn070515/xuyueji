# ADR-0009 受限正则引擎与分阶段管道

日期：2026-11-18  
状态：已采纳（M2）  
关联：`docs/xuyueji_kickoff/ENGINE_SPEC.md`「宏、正则、脚本」、`PRODUCT_SPEC.md` F11、
`TEST_STRATEGY.md` T18

## 背景

`ENGINE_SPEC.md` 要求正则按阶段（用户输入预处理、Prompt 构建、模型输出后处理、仅展示）
执行，并且必须用「可证明限时/限大小」的方式运行；文档明确不保证浏览器/Node 的
`RegExp` 能在灾难性回溯中途被中止。用户导入或手写的表达式属于不可信输入，
不能把它直接交给 `new RegExp()` 在主线程上跑。

## 决策

1. **自研受限引擎** `packages/tavern-core/src/safe-regex.ts`
   - 解析支持子集：字面量、`.`、`[...]`（范围、`^` 取反）、`\d \w \s \D \W \S`、
     转义标点、`\n \t \r`、锚点 `^ $`、量词 `* + ? {n} {n,} {n,m}`（含惰性 `?`）、
     捕获/非捕获组、`|` 交替、标志 `i m s`。
   - 明确拒绝（`unsupported-syntax`）：环视、命名组、内联标志组、反向引用、
     Unicode 属性转义、`g/u/y` 等标志。
2. **先拒绝后执行**
   - 解析后遍历 AST，拒绝「无限外层量词包住无限内层量词」或「包住可空节点」的形状
     （`(a+)+`、`(a*)*`、`(a|)*`），对应 `unsafe-pattern`。
   - 编译为小型指令集，程序长度有上限（默认 20,000 条）。
3. **确定性步数预算**
   - 执行是带回溯栈的指令 VM，每执行一条指令计一步；超过 `maxSteps`（默认 250,000）
     抛 `step-limit`，不是墙钟超时，因此同一输入每次结果一致、可复现。
   - 同时限制模式长度（2,000）、输入长度（100,000）与替换次数（5,000）。
   - 这些上限由 `SafeRegexLimits` 注入，测试用小预算验证中止路径。
4. **阶段语义**
   - `user_input`：作用于本轮用户输入，且世界书扫描使用改写后的输入。
   - `prompt_build`：只作用于可注入内容（预设段、Persona 描述、世界书正文、示例、
     历史消息）；**平台策略、角色卡与收尾约束永不改写**。
   - `model_output` / `display_only`：本切片不做服务端执行；Prompt 预览把它们列在
     `regex.deferred` 中，明确「模型运行时未接入 / 仅客户端展示」。
5. **存储与 API**
   - `regex_rules.replacement` 迁移入列；`/api/regex-rules` 提供 CRUD（CAS revision、
     软删除、`sync_changes`）与 `/api/regex-rules/test` 试运行。
   - 写入路径（REST 与 `/api/mutations`）都先 `compileSafeRegex` 校验；非法表达式
     返回 400 `REGEX_INVALID` / mutation `INVALID_PATTERN`，不落库。
   - Prompt 预览按显式 `regexRuleIds` 选择规则；未选中的规则不生效。

## 影响

- 用户可预期：非法或危险表达式在保存时被拒，而不是在生成时把服务拖死。
- 兼容性缺口：不支持环视、反向引用与 Unicode 属性；需要这些能力的世界书/正则
  导入会得到明确错误，后续可按需扩展受控语法。
- `display_only` 规则尚未在聊天渲染层应用；`model_output` 要等 M3 模型运行时。
- 世界书条目的「可选正则触发」复用同一引擎：条目设置 `matchMode: "regex"` 时用安全
  子集匹配扫描文本，写入前校验；历史/导入数据里的非法表达式在匹配时跳过并记
  `invalid-regex` 警告，不会抛出或挂起。

## 测试

- `packages/tavern-core/src/safe-regex.test.ts`：21 条，覆盖字面量/类/锚点/捕获组替换/
  惰性/边界量词/空匹配、嵌套量词拒绝、环视与反向引用拒绝、步数上限、输入与匹配上限。
- `packages/tavern-core/src/world-info.test.ts`：新增 3 条正则触发用例（命中、次关键词
  门控、非法表达式跳过并警告）。
- `apps/api/src/regex.integration.test.ts`：6 条，覆盖 CRUD/CAS/对象隔离、写入校验、
  试运行、Prompt 预览两阶段应用与 `deferred` 上报、世界书正则触发、mutation 校验与
  `replacement` 持久化。
- `apps/web/e2e/cloud.spec.ts`：正则规则创建 → 试运行 → 聊天预览改写用户输入；
  世界书条目按正则触发并在 `systemPrompt` 中出现。
