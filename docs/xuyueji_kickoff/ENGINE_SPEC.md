# Tavern Engine 规格：确定性 Prompt 编译

## 不是字符串拼接，而是编译器

```text
ConversationState + Character/Persona/WorldBook/Memory/Preset Versions
       ↓ validate + snapshot
Typed Prompt AST
       ↓ expand safe macros + resolve worldbook + memory retrieval
Resolved Components [content, source, priority, tokenEstimate]
       ↓ budget planner (mandatory vs optional, truncate strategy)
Prompt Plan with provenance and cost estimate
       ↓ model adapter render
DeepSeek request (server policy enforced)
```

输入必须包括：模型能力表、上下文预算、预设版本、角色与群聊参与者顺序、当前分支消息路径、固定时钟和随机种子（用于可重复概率触发）。输出：带 provenance 的 Prompt Plan、每组件估算 Token、裁剪理由、警告列表、确定性 digest。**同样快照+种子应得到相同结果。**

## World Info 算法契约

1. 确定作用域：全局/角色/会话及参与角色关联的书；确定稳定排序。
2. 收集当前会话路径的候选扫描窗口，做规范化匹配（大小写、词边界、主/次 key）；条件规则先验收。
3. 常驻条目进入候选，普通条目按关键词/正则命中；概率仅用注入的 seeded RNG，不能 `Math.random()` 破坏复现。
4. 可选递归激活：每轮记录已访问条目，最大深度、条目数、字节和 Token 限额同时限制；检测环。
5. 冲突：禁用条目永不注入；位置、优先级、插入深度及占用预算按明确规则处理；若超预算需返回被舍弃条目清单。
6. 记录每次命中来源、命中理由和实际注入位置供 UI 检查。

## Prompt 组成和顺序

默认次序：平台不可变政策 → 预设的可编辑系统段 → 角色卡/Persona → 世界书与已确认记忆 → 示例对话 → 历史路径 → 作者备注/插入深度片段 → 当前用户输入 → 结尾约束。**用户可在授权的编辑范围内拖动组件，不可置换平台强制策略。**

预算先预留固定安全开销与最大输出，使用精确 token 估计器（与上游差异需监控）。先保留不可缺少的当前指令与最近消息，再按可解释的优先级裁剪旧历史/可选条目；从不静默丢掉已锁定关键事实，若仍超额拒绝并提示调整。

## 宏、正则、脚本

- 宏采用受限解释器，允许变量读取、模板插值和可测试的纯函数；禁止访问 `process`, DOM、网络、文件系统、API Key、钱包余额写操作。变量的作用域和是否注入模型要显式。
- 正则流水线标明阶段：用户输入预处理、Prompt 构建、模型输出后处理、仅展示；启用可证明限时/限大小的执行方式（如安全正则子集或专用 Worker）；不保证浏览器主线程任意 JS RegExp 可被安全中止。
- Markdown/HTML 输出用消毒后的渲染器；角色卡的内嵌 CSS、HTML、外链和图片不得默默获得脚本执行权。
- 快捷回复/命令系统通过有限指令 registry 实现，每个 handler 声明读写权限、所需能力及是否收费；`/` 命令与扩展不直接调用付款 API。

## 记忆系统

分离：`manual_fact`（用户核准）、`event`（剧情时间线）、`summary`（AI 生成）、`relationship`（角色关系）和 `retrieval_hit`（只读检索结果）。每条含来源节点、版本和作用域。AI 总结默认待确认或清楚标注自动结果，允许人工回滚与纠错。摘要请求也产生 provider usage 和可计费 generation_run，不能隐性扣积分。

## 导入/导出兼容

- Character Card V2/V3 JSON、PNG/文本字段；世界书、人格、预设与聊天 JSONL 分别有 adapter。
- 通过 fixture 测 `import → normalize → export → re-import`：已理解字段语义一致，未识别扩展字段不丢失或清晰报告。
- 导入文件设置体积/数量限制、ZIP 解压上限、路径穿越防御、恶意内容过滤；不执行角色卡中的 JS/HTML。
- DeepSeek 官方 ZIP 导入前先做结构探测，不要依赖未验证的单一版本结构；不支持字段显示转换报告。

## 必须存在的可解释性 UI

用户至少能查看：生效角色/Persona版本、世界书触发条目、记忆引用、Prompt 结构、预计/实际 Token、裁剪原因、费用上限；资深酒馆用户可切到开发者视图查看结构化 Trace（不泄漏管理员密钥）。
