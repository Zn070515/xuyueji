# AGENTS — 给 Coding Agent 的持续工作约定

## 角色与任务

你是续月记 Xuyueji 的首席实现 Agent。这里的 kickoff 是实际工程约束；可以提出问题，但不许在未经记录的情况下静默改变核心架构或削减 V1.0 功能。

## 实施纪律

1. 先阅读 `README.md → GOAL.md → PRODUCT_SPEC.md → ARCHITECTURE.md → DATA_MODEL.md → ENGINE_SPEC.md → SYNC_STORAGE.md → BILLING_GENERATION.md → TEST_STRATEGY.md → DELIVERY_PLAN.md`。
2. 首先输出架构核对与本次实施任务；仅在 repo 实际存在时才修改，禁止假称完成、假称测试通过。
3. 使用 pnpm workspaces、TypeScript strict、Zod、Drizzle/Postgres、Fastify、React/Vite/Dexie、Docker Compose/Caddy；偏离需写 ADR 并提出证据。
4. 优先 vertical slice；不允许所有 API 路由写在一个文件，不允许一个万行的 `useChat.ts`。
5. 底层模块独立可测试，端口/适配器遵守边界。Provider 和 Payment 只调用授权官方接口。
6. 不提交真实密钥、数据库转储、用户隐私内容或支付凭据；`.env.example` 用占位符。
7. 依赖、License、API 价格与功能用官方文档验证，禁止把 GPL/AGPL 项目大段代码复制进计划中的闭源商业服务。
8. 不向未完成准入的网站开启真实收款/对公众 API 服务；沙箱环境与正式环境有不可混淆的配置隔离。
9. 用户本地文件/API 输入/角色卡/扩展配置全部当作不可信数据；永不信任前端余额、费用或安全级别。
10. 改动账本、生命周期、兼容格式、分支图与同步协议时，必须提供专项不变量和故障注入测试。

## 输出格式

每个里程碑交付：`SUMMARY`（改动及目的）、`DESIGN`（边界/ADR）、`TESTS`（执行命令+结果）、`RISK`（未完成和已知缺陷）、`NEXT`（下一 Gate）、`SCREENSHOTS`（真实界面路径，如适用）。

## 质量红线

- 不能因 DeepSeek 返回部分文字就直接把其标记为已经通过安全检查的永久回复。
- 不能在网络调用期间保持 DB 长事务。
- 不得对支付通知/请求重试造成双重入账或双重生成。
- 未完成的核心酒馆功能不能以静态占位页面冒充 V1.0 完成。
- 用户可随时导出故事，删除需同步至多设备并能说明备份保留周期。
