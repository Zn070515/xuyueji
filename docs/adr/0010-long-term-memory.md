# ADR-0010 长期记忆：确定性词面检索与 Prompt 注入

日期：2026-11-18  
状态：已采纳（M2）  
关联：`docs/xuyueji_kickoff/ENGINE_SPEC.md`、`PRODUCT_SPEC.md` F13/F14、`DATA_MODEL.md`

## 背景

M1 已建 `memory_items` 表（kind、content、conversation_id、scope、locked、revision、
deleted_at），但没有 CRUD、检索或 Prompt 注入。产品要求「手动事实、自动摘要、时间线、
角色关系、锁定与版本回退」以及「本地检索/按需引文/可解释来源」，且上下文预算独立可控。

M2 阶段没有模型调用，自动摘要无法真正生成；本切片先把手动记忆链路做通，并为后续
自动摘要留出同一张表与同一套注入路径。

## 决策

1. **确定性词面检索，不做向量检索**
   - `packages/tavern-core/src/memory.ts` 的 `selectMemories` 是纯函数：给定记忆集合、
     查询、会话与预算，结果完全可复现。
   - 分词：ASCII 词（≥2 字符）小写 + CJK 单字与二元组；过滤中英文停用词/功能字。
   - 打分：命中词数；`locked` 记忆 +1000 恒定置顶；同分按 kind 优先级
     （manual_fact > relationship > summary > event > retrieval_hit）、updatedAt、id 排序。
   - `scope: "global"` 且无命中的记忆作为背景兜底（reason `recent`），排在所有命中之后。
   - 预算：条目数、字节、token 三重上限（默认 8 条 / 16 KiB / 1200 tokens），超限记
     `budget`；绑定其他会话的条目记 `other-conversation`；空内容记 `empty`。

2. **Prompt 注入**
   - `PromptSources.memories` → `memory` 组件，可选、优先级 560、排序位 35
     （在 persona 之后、world info 之前），预算不足时按既有规则裁剪。
   - `/api/prompt/preview` 支持 `memoryIds`（显式）与 `autoMemory`（自动检索，查询为
     改写后的用户输入）；两者同时给出时合并去重。
   - 响应返回 `memory.selected`（含 score、matchedTerms、reason）与 `memory.skipped`，
     用户能看到为什么注入某条记忆。

3. **CRUD 与同步**
   - `/api/memories`：list（可按 conversationId 过滤）、create、get、update（CAS）、
     delete（软删除）；每次写入记 `sync_changes`。
   - 绑定会话前校验会话属于当前用户；`/api/mutations` 的记忆路径同样校验。
   - `scope` 限定为 `conversation` / `global`；`kind` 限定为既有五类。

4. **Web**
   - `/memories` 从占位页变为真实编辑器：类型、范围、会话绑定、锁定、删除、版本提示。
   - 云端聊天 Prompt 面板新增「启用长期记忆检索」开关，展示注入条数与命中词。

## 影响

- 同一输入、同一记忆集合、同一预算 → 同一选择与 digest；便于复现与解释。
- 词面检索对同义改写（「怕水」vs「惧怕水域」）不稳定，这是明确取舍：无模型调用的
  M2 不做 embedding，F14 的向量检索与引文跳转留到后续。
- 自动摘要仍需模型：M3 接入 DeepSeek 后以同一 `memory_items(kind="summary")` 写入。
- 记忆内容会成为不可信输入：它进入 Prompt 但受预算约束，平台策略仍由服务端固定；
  与其他用户内容一样不得覆盖平台策略。

## 测试

- `packages/tavern-core/src/memory.test.ts`：6 条（分词、命中排序、锁定置顶、会话隔离、
  预算裁剪、可复现）。
- `packages/prompt-engine/src/compiler.test.ts`：新增 memory 组件位置用例。
- `apps/api/src/memory.integration.test.ts`：4 条（CRUD/CAS/对象隔离、跨用户会话绑定拒绝、
  自动检索注入与 digest 复现、跨会话排除与显式缺失上报）。
- `apps/web/e2e/cloud.spec.ts`：创建锁定记忆 → Prompt 预览注入并出现在 `systemPrompt`。
