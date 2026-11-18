# ADR-0008 世界书触发 + 确定性 Prompt 编译器

状态：Accepted（2026-11-18）

## 决策

1. **世界书触发是纯函数**
   - 输入：条目、最近消息文本、当前用户输入、固定 seed、预算；依赖只注入 token 估算器。
   - 常驻条目先激活；普通条目按主关键词 + 可选次关键词匹配；ASCII 关键词带词边界，CJK 用子串。
   - 概率只用 seeded RNG（seed + entry id 派生），同 seed 同结果。
   - 递归激活只扫描上一轮新激活且 `recursive` 的条目内容；visited 防环；记录 `already-activated`；受 maxDepth / maxEntries / maxBytes / maxTokens 限制。
   - 输出带 provenance：命中原因、matchedKeys、depth、估算 token、skipped reason、trace、warnings。

2. **Prompt 编译器是确定性的**
   - 固定目标顺序：平台策略 → 预设系统段 → 角色 → Persona → 世界书 → 示例 → 历史 → 作者备注 → 当前输入 → 结尾约束。
   - 平台策略、角色、当前输入、结尾约束为 mandatory；其余按 priority 选入。
   - 预算先扣 maxOutput 与 safety reserve；mandatory 超预算直接抛 `PromptBudgetExceededError`，不静默截断。
   - 历史按“越新 priority 越高”选入，旧消息先被裁掉；输出 warnings 与包含/排除 reason。
   - 输出 `systemPrompt` + `messages`（历史 + 当前输入）、每组件 token 估算、总输入 token、digest。
   - digest 用 FNV-1a（确定性、非加密）；真实 tokenizer 通过依赖注入，默认启发式为 chars/3，仅用于预览/排序。

3. **服务端 Prompt 预览**
   - `POST /api/prompt/preview`：认证后加载角色 active version、分支最近 50 条消息、可选 lorebook entries，执行世界书匹配 + 编译。
   - 只读预览，不调用模型；客户端不能提交可信 prompt/价格/安全级别。
   - 预算超限 422 `PROMPT_BUDGET_EXCEEDED`，附 required/available。

4. **边界**
   - 世界书条目来自 DB，但 `rule_jsonb` 仍是不可信输入：无效规则跳过并 warning。
   - 角色卡/世界书中的文本不能覆盖平台策略；平台策略在编译器中固定为第一个 mandatory 组件。
   - 正则触发、`at_depth` 的实际插入渲染、记忆检索、Preset Manager UI 尚未实现。

## 替代方案

- **字符串拼接**：无法解释裁剪与来源；选择 AST/组件计划。
- **每次随机概率**：不可复现；选择 seeded RNG。
- **历史按旧→新填预算**：预算紧张时先丢最新消息；选择新消息优先。
- **前端编译作为权威**：客户端可伪造；服务端从权威版本重新编译，前端只预览。

## 已知缺口

- 世界书正则触发与安全超时子集未实现。
- `at_depth` 位置只参与排序，尚未渲染进历史指定深度。
- 记忆/Persona/预设编辑 UI 未接；API 预览请求可带 persona，lorebooks 需已有 DB 条目。
- 没有真实 DeepSeek tokenizer；预算数字是估算。
- 没有客户端 Prompt 预览面板；目前通过 API 验证。

## 来源

- `ENGINE_SPEC.md` 世界书算法契约、Prompt 组成与预算
- `packages/tavern-core/src/world-info.ts`、`packages/prompt-engine/src/compiler.ts`
- `apps/api/src/routes/prompt.ts`
