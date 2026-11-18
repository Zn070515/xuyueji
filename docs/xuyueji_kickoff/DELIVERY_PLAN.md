# V1.0 实施计划（全部核心模块首版交付）

## Gate M0 — 软件工程底座与支付材料页面

**交付**：Monorepo、pnpm/TS strict、Fastify shell、React/Vite 响应式 UI、Caddy/Compose 开发部署、迁移系统、CI、测试容器、真实首页/钱包介绍/聊天演示、协议/隐私/联系页。
**验收**：本地 `pnpm install && pnpm test && pnpm build` 可运行；页面真实源自代码，充值未签约明确禁用，Playwright 可截首页/充值/聊天三图；不泄露凭据。部署前校验 ICP 及 AI 业务手续，开发与截图不等于公众可收费上线。

## Gate M1 — 领域数据模型与云端存档

**交付**：users/characters/personas/lorebooks/presets/regex/memory/conversations/message graph Schema，Dexie、sync outbox、CAS、分页查询、云端保存、基本导入导出。
**验收**：两设备并发、离线草稿、删除 tombstone、数千消息分页、数据导出/恢复均通过测试。

## Gate M2 — 完整文本酒馆引擎

**交付**：角色卡 V2/V3 PNG/JSON、世界书触发/预算/递归、Persona、群聊、Preset Manager、宏、受限正则/快捷命令、长期记忆（手动/自动/检索）、Swipe、分支、Prompt trace。
**验收**：Golden fixtures 在多个角色和群聊场景中产生确定性 Prompt；导入导出 round-trip、分支不变性及世界书环检测均通过。

## Gate M3 — DeepSeek 运行时与积分闭环

**交付**：Provider adapter、stream、最终 usage、强制高安全级别、消息提交状态机、tariff 版本、钱包冻结/结算、供应商余额监控、支付宝沙箱/退款状态机。
**验收**：T05–T09、T13、T17 通过；客户端重复点击/断线/支付重放无双扣；绝不在日志输出 Key。

## Gate M4 — 酒馆体验、兼容与运营功能

**交付**：主题、快捷键、高级编辑器、移动端、浏览器朗读/外部媒体能力适配接口、管理后台、投诉处理、年龄保护、AI 标识与使用时长提醒、完整自助导出/删除、备份运维。
**验收**：真实使用者不看源代码能完成 4 条产品旅程；对比成熟酒馆功能清单逐项实测。

## Gate M5 — 发布审查与容量测试

**交付**：端到端/安全/可访问性/资源压力/隐私/恢复演练，正式支付准入和业务所需手续核查，完整运营文档。
**验收**：所有 P0+P1 通过，已知缺陷分级无 P0/P1 未解决；生产限流/监控可用；真实支付宝付款及退款受控小额演练成功；准入满足后才开放公众付费。

## Agent 分工约定

- 每个 Gate 先写设计/测试草案，再实现最小垂直切片，最后补齐该 Gate 的完整契约与回归测试。
- 提交按领域拆分、小 PR；禁止“大批量堆代码到 CI 全绿但主要链路没用户验收”。
- CI 永远检查格式、静态类型、lint、单测、Postgres 集成、Playwright 冒烟、迁移可运行性。
- Gate 未满足：不允许声称 V1.0 可发布；也不允许因为赶进度把 P1 核心功能改成未来版本。

## 首轮具体工单（适合立即给 Agent）

1. 脚手架、pnpm workspace、GitHub Actions CI、环境变量模板、TS strict、Vitest/Playwright。
2. `domain` 中 ID、revision、money/points、带版本的 character schema、branch node schema、DTO 验证。
3. Fastify `GET /health`、Caddy/Compose、Postgres 测试容器，基础 RBAC 和 migration。
4. 首屏真实落地：官网、聊天 shell、充值套餐与服务说明、法律页面；生成本地截图，但支付按钮关闭。
5. 写第一组契约测试：编辑角色 CAS 冲突、分支 Swipe 不覆盖、重复订单回调幂等。
6. 交付 `M0_REPORT.md`：架构偏差/测试结果/待审批事项/可再现命令/截图路径。
