# 给 Coding Agent 的首轮开工指令（可整段粘贴）

你现在负责新项目 `Xuyueji / 续月记`。请读取仓库根目录的全部 kickoff 文档，尤其 `AGENTS.md`、`GOAL.md`、`PRODUCT_SPEC.md`、`ARCHITECTURE.md`、`DATA_MODEL.md`、`ENGINE_SPEC.md`、`BILLING_GENERATION.md`、`SYNC_STORAGE.md`、`TEST_STRATEGY.md`、`DELIVERY_PLAN.md`。这是完整商业 AI 酒馆，不是套壳聊天 MVP；所有 P0/P1 必须在 V1.0 中交付，里程碑只是实现顺序。

硬约束：域名 xuyueji.cn；目标服务器阿里云杭州 Ubuntu 24.04、2C2GiB、40GiB、3Mbps；云端 PostgreSQL 是权威存档，Dexie 浏览器缓存，导出可移植文件；DeepSeek 官方 API + `safety_check=high`，模型密钥只在服务端；支付宝优先、订单/积分钱包采用不可变账本；未取得支付与 AI 运营手续前仅允许本地、受控开发与沙箱演示。

现在开始 M0：

1. 审查 kickoff 文档内可能不一致的约束，形成 ADR/风险清单；若无法在线核实 API 细节先封装 adapter，不得假设参数稳定。
2. 建立 pnpm/TS strict monorepo（apps/web、apps/api、packages/domain/contracts/tavern-core/prompt-engine/sync/compat/provider/billing）、CI、Vitest、Playwright、Docker Compose 开发环境、PostgreSQL migration、Caddy 配置以及 `.env.example`。
3. 建立真实可交互的首页 `/`、聊天 `/chat` 的 UI 骨架、钱包 `/wallet`（所有真实充值按钮在未授权前必须禁用）、服务/隐私/积分/退款/联系页面。采取「月夜蓝 + 暖纸白」视觉体系，手机优先，但桌面高级编辑器要可扩展。所有展示数据标明 demo，不能伪造已付款交易。
4. 实现初始领域 Schema 与至少三条不变量测试：消息 Swipe 不覆盖、角色版本 CAS、支付回调唯一入账（用 mock provider）。写好端到端的请求/数据边界，即使真正服务暂未实现。
5. 启动本地真实网页，使用 Playwright 在**实际渲染页面**截取首页、钱包、聊天三张图，作为未来支付宝商户审核预备材料，禁止生成虚构支付成功截图。
6. 输出 `M0_REPORT.md`，包含改动清单、验证命令与真实结果、当前功能和缺口、预估 ECS 资源、下一步 M1 工单；若有未验证事项明确标记。

不要跳过自动测试；不要将核心功能推迟到 V2；不要先购买其它云服务；不要未经批准对公众开放收费或模型服务。使用官方资料作为功能/价格/许可证依据。M0 完成后再进入 M1，且每次修改都保持 CI 绿色。
