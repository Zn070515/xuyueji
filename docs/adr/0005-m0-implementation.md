# ADR-0005 M0 工程底座实现决策

状态：Accepted（2026-11-18）

## 背景

Kickoff 文档要求 pnpm/TS strict monorepo、Fastify、React/Vite/Dexie、Drizzle/Postgres、
Docker Compose/Caddy、Vitest/Playwright，并在 M0 交付真实页面、领域不变量测试与真实截图。
文档同时要求「价格不硬编码前端」「未授权前不开放真实支付」「不在 ECS 上构建」。
本 ADR 记录 M0 实际选型、偏差与风险。

## 决策

1. **包管理与类型**
   - pnpm 12 workspaces，TypeScript 7 native compiler，`strict` +
     `noUncheckedIndexedAccess`，单一根 `tsconfig.json` 做全仓类型检查。
   - workspace 包通过 `package.json#exports` 直接暴露 `src/index.ts`，Vite/Vitest/tsx 直接
     消费源码；API 生产产物由 tsup 打包，workspace 包通过 `noExternal` 内联。
   - 这避免 M0 阶段维护多套 project references 与 `dist` 声明，同时保持包边界。

2. **Lint/Format**
   - 用 Biome 2 统一 lint + format，CI 与本地同一命令。
   - Tailwind v4 的 `@theme` 通过 `css.parser.tailwindDirectives` 启用解析。

3. **数据库**
   - Drizzle ORM + `postgres:17-alpine`。迁移由 `drizzle-kit generate` 生成，迁移运行器为
     `apps/api/src/db/migrate.ts`（部署时先迁移再启动 API）。
   - M0 schema 只覆盖已有不变量测试的核心表；persona/lorebook/preset/regex/memory/refund
     等表在 M1/M2 增加。

4. **演示模式与安全闸门**
   - `DEMO_MODE` 默认 true；只有 `DEMO_MODE=false` 且 `PAYMENTS_ENABLED=true` /
     `AI_ENABLED=true` 时才启用生产能力。M0 中该路径没有任何真实实现，开关只是预留边界。
   - `/api/demo/*` 使用进程内状态，重启即清空；界面明确标注「演示」与「未调用模型」。
   - 支付回调使用 HMAC mock provider，不是支付宝 SDK；不得被解读为支付已开通。

5. **前端**
   - React 19 + Vite 8 + React Router 7 + Tailwind 4；不引入 shadcn 运行时，只使用
     Tailwind token 与自写无障碍组件，避免 M0 被组件库锁定。
   - Dexie 只保存聊天草稿，证明「浏览器缓存不是权威存档」的边界；M1 再接 outbox。
   - 未实现路由（角色/世界书/预设/记忆/设置/后台）使用统一的 `PlannedPage`，明确标注
     Gate 与「不是功能页」，不伪造功能。

6. **契约**
   - Zod 4 在 HTTP 边界 `strict()` 解析，拒绝未知字段（例如客户端伪造 `ownerUserId`）。
   - 领域错误映射为稳定的 code/status：CAS 409、支付拒绝 400、积分不足 402、校验 400。

7. **部署**
   - Web 镜像多阶段构建后只保留 Caddy + 静态文件；API 镜像用 `pnpm deploy --legacy`
     产出仅含生产依赖的运行时目录。
   - Caddy 负责静态资源、SPA fallback、CSP/安全头与 `/api` 反代；Postgres 不暴露公网。
   - Compose 在本地把 DB 绑定到 `127.0.0.1`，Caddy 映射 8080/8443；生产需改为 80/443
     与域名。

8. **截图**
   - Playwright 在真实 Vite + Fastify 进程上截取首页/钱包/聊天三图。
   - full-page 截图前把 sticky header 改回静态流，避免 Playwright 把固定元素画到页面中部。
   - 截图为 M0 演示证据，不是支付或 AI 服务获批证明。

## 替代方案与取舍

- **纯 CSS 而非 Tailwind**：更少依赖，但与 kickoff 指定的 Tailwind/shadcn 目标偏离更大；
  选择 Tailwind 4，只放弃 shadcn。
- **Next.js / SSR**：与文档的 Vite 静态构建和 Caddy 反代不符，且增加 2 GiB 实例内存压力。
- **Prisma**：Drizzle 更接近 SQL、迁移可审阅，符合「schema 约束落在数据库」的要求。
- **React Query / Zustand**：M0 页面状态很少，原生 hooks + Dexie 足够；避免过早引入。
- **直接接 DeepSeek SDK**：M0 明确不调用模型；M3 再按官方文档封装 adapter 与 capability test。

## 风险清单（M0 未消除）

| ID  | 风险                                                    | 当前处理                                    | 何时关闭   |
| --- | ------------------------------------------------------- | ------------------------------------------- | ---------- |
| R1  | 支付宝商户、ICP、AI 服务登记/评估/算法备案未完成        | 仅 demo/mock；充值按钮禁用；页面公示        | M3/M5 前   |
| R2  | DeepSeek 模型 ID、参数、价格、流式 usage 字段未在线核实 | 未集成；tariff 表留空；不做价格承诺         | M3         |
| R3  | 2 vCPU / 2 GiB / 3 Mbps 未做压力测试                    | 设定限流、bodyLimit、连接池上限；不宣称容量 | M5         |
| R4  | 认证、对象级授权、同步、tombstone、导出未实现           | 不开放注册与真实数据；仅演示边界            | M1         |
| R5  | 法律文本为草案，未审                                    | 页面明确标注草案；不接收真实用户/付款       | 正式上线前 |
| R6  | Docker 镜像未在生产等价环境演练                         | 本地验证 compose config/build（见 M0 报告） | 部署演练   |
| R7  | 演示数据/截图可能被误读为已开通能力                     | 全局 banner、页面文案、报告三处声明         | 持续       |

## 来源

- `docs/xuyueji_kickoff/AGENTS.md`、`DELIVERY_PLAN.md`、`BILLING_GENERATION.md`
- `docs/xuyueji_kickoff/adr/0001`–`0004`
- 本仓库 `M0_REPORT.md` 的实际命令输出
