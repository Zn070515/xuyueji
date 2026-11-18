# M0_REPORT — 续月记 Xuyueji

日期：2026-11-18  
状态：**M0 实现完成，等待 review；未进入 M1**  
基线：`docs/xuyueji_kickoff/`（2026-11-18 kickoff 包）

---

## SUMMARY

M0 交付了可运行、可验证的工程底座，而不是一个静态占位站：

- **Monorepo**：pnpm 12 workspaces；`apps/web`、`apps/api`、`packages/{domain,contracts,tavern-core,prompt-engine,compat,sync,provider,billing}`；TypeScript 7 strict；Biome 2 lint/format；Vitest；Playwright。
- **API**：Fastify 5，Helmet、全局限流、64 KiB body limit、稳定 request id、结构化错误；`GET /health`、`GET /api/meta`、`GET /api/demo/state`、角色版本 CAS demo、mock 支付回调 demo。
- **领域**：不可变消息图（Swipe 兄弟候选、编辑生成新分支、tombstone）、角色版本 CAS、生成状态机、整数积分钱包、不可变账本、支付回调幂等（HMAC mock provider）。
- **数据库**：Drizzle ORM + PostgreSQL 17；1 个 migration、15 张表；钱包非负、账本幂等键、订单号、`generation_runs(owner, client_request_id)`、`cost_points <= cap_points` 等约束落在 DB。
- **Web**：React 19 + Vite 8 + React Router 7 + Tailwind 4；真实可交互的首页 `/`、聊天 `/chat`、钱包 `/wallet`、协议 `/terms`、隐私 `/privacy`、退款 `/refunds`、联系 `/contact`、帮助 `/help`；未实现模块用统一 `PlannedPage` 标注 Gate，不冒充完成。
- **安全边界**：`DEMO_MODE` 默认 true；M0 直接拒绝 `DEMO_MODE=false` 启动（没有生产数据/身份/支付路径）；M0 无真实模型调用、无真实订单、无真实收款；充值按钮全部禁用。
- **部署**：Caddy + Compose + 多阶段镜像；API 镜像 296 MB，Web/Caddy 镜像 94.9 MB；本地完整栈已跑通。
- **证据**：三张真实页面截图 + 手机首页截图；CI workflow；`docs/adr/0005-m0-implementation.md` 记录偏差与风险。

M0 **没有**：公开注册/登录、对象级授权、云端同步、Dexie outbox、完整导出、世界书/Prompt 引擎、DeepSeek 调用、支付宝真实接入、管理后台、正式法律文本。

---

## DESIGN

### 依赖边界

```text
apps/web  ──只依赖──> packages/contracts（类型边界）
apps/api  ──依赖──> packages/domain / billing / contracts
packages/domain   无框架、无 DB、无网络
packages/billing  只依赖 domain；账本与钱包规则纯函数
tavern-core / prompt-engine / compat / sync / provider  M0 仅有诚实接口与 Gate 状态
```

- 客户端展示的余额、价格、安全级别不会被服务端信任；HTTP 契约 `strict()` 拒绝未知字段（测试覆盖伪造 `ownerUserId`）。
- `generation_run`、`message_node`、`wallet_ledger` 生命周期独立；M0 只实现前两者的词汇/不变量与账本规则，真正事务编排在 M3。

### 关键不变量（已有测试）

1. **角色版本 CAS**：过期 `expectedActiveVersionId` → 409，active pointer 与版本链不变。
2. **Swipe 不覆盖**：同一父节点下新增候选不删除旧候选；候选共享 `responseGroupId`；切换候选只移动 branch head。
3. **编辑不改写历史**：编辑旧消息生成替代节点和新分支，原节点/原分支仍可回放。
4. **支付回调幂等**：同一商户订单重复通知 10 次只入账一次；签名/金额/币种/订单状态均校验。
5. **钱包非负**：`available_points >= 0`、`reserved_points >= 0`；结算不得超过冻结上限。
6. **数据库幂等**：`wallet_ledger.unique_key`、`payment_orders.merchant_trade_no`、`generation_runs(owner_user_id, client_request_id)` 唯一；`cost_points <= cap_points`。

### 安全与范围闸门

- `DEMO_MODE` 默认 true；M0 在 `DEMO_MODE=false` 时**拒绝启动**，避免把演示接口挂在生产配置下。`PAYMENTS_ENABLED` / `AI_ENABLED` 只是为后续 Gate 预留的配置位，M0 没有实现。
- M0 的 `/api/demo/*` 是进程内状态，重启即清空；页面全局 banner 与文案明确标注。
- 支付 provider 是 HMAC mock，不是支付宝 SDK；不存在真实商户号、私钥或回调地址。
- 日志配置对 authorization、cookie、apiKey、signature 做 redaction。

### 与 kickoff 的偏差 / 决策

详见 `docs/adr/0005-m0-implementation.md`，摘要：

- Tailwind 4 + 自写组件，未引入 shadcn 运行时（避免 M0 被组件库锁定）。
- workspace 包直接暴露 TS 源码，API 生产构建用 tsup 内联；未采用 project references。
- DB schema 只覆盖已有不变量测试的核心表；persona/lorebook/preset/regex/memory/refund 在 M1/M2 增加。
- Biome 统一 lint/format；不使用 ESLint + Prettier 双工具链。

---

## TESTS

以下为本地实际执行结果（Windows 11，Node 24.22.0，pnpm 12.14.0，Docker 29.6.1）。

| 命令                                | 结果                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                    | **PASS**，exit 0（TS 7 strict，全仓）                                                                                                          |
| `pnpm lint`                         | **PASS**，`Checked 107 files`，0 错误                                                                                                          |
| `pnpm test`（无 DATABASE_URL）      | **PASS**，32 passed / 5 skipped（DB 集成按设计跳过）                                                                                           |
| `DATABASE_URL=... pnpm test`        | **PASS**，**37 passed / 7 files**，含 5 条 PostgreSQL 约束测试                                                                                 |
| `docker run -e DEMO_MODE=false ...` | **PASS（按设计拒绝）**：进程 exit 1，报 `M0 only supports demo mode`                                                                           |
| `pnpm build`                        | **PASS**：Web JS 420.42 kB（gzip 134.22 kB），CSS 34.20 kB（gzip 7.03 kB）；API `server.js` 30.57 kB、`migrate.js` 13.37 kB                    |
| `pnpm e2e`                          | **PASS**，12 passed / 2 skipped（桌面 + Pixel 7；跳过的是不属于该项目的截图用例）                                                              |
| `pnpm screenshots`                  | **PASS**，三张桌面截图 + 手机首页                                                                                                              |
| `pnpm db:migrate`                   | **PASS**：`Migrations applied from .../apps/api/migrations`                                                                                    |
| `docker compose config -q`          | **PASS**，exit 0                                                                                                                               |
| `docker compose build`              | **PASS**：`xuyueji-api` 296 MB，`xuyueji-caddy` 94.9 MB                                                                                        |
| `docker compose up -d --wait`       | **PASS**：db/api/caddy 均 healthy                                                                                                              |
| Caddy 全栈冒烟                      | **PASS**：`/` `/wallet` `/chat` `/terms` `/api/meta` `/health` `/api/demo/state` 与静态 asset 全部 200；CSP 与 `X-Content-Type-Options` 已下发 |

### 值得记录的真实问题（已修复）

1. **Fastify 错误处理注册顺序**：`setErrorHandler` 放在 `app.register(route)` 之后时，子插件上下文仍走默认处理器，DomainError 被序列化为 500。已改为先注册 handler / notFound，再注册路由；CAS 现在返回 409。
2. **Drizzle 驱动错误包装**：约束名在 `DrizzleQueryError.cause`，不在外层 message；DB 测试改为断言 PG `constraint`。
3. **Playwright 全页截图**：`fullPage` 会把 sticky header 画到页面中部；截图前将 header 改为静态流并隐藏 fixed 移动导航。同时把异步回复等待从 `.last()` 改为数量断言（初始消息已有同文案）。
4. **pnpm 12 构建脚本**：仅写 `onlyBuiltDependencies` 仍报 `ERR_PNPM_IGNORED_BUILDS`；实际键是 `allowBuilds`（由 `pnpm install --allow-build=...` 写入）。
5. **本机 Docker Hub 鉴权超时**：首次 `docker compose build` 卡在 `auth.docker.io`；改用镜像站拉取 `node:24-alpine` / `caddy:2-alpine` 并在本地打回官方 tag 后构建成功。Dockerfile 本身未写死镜像站。
6. **本机 8080 被占用**：Compose 容器创建成功但 `NetworkSettings.Ports` 为空，宿主机 8080 返回的是另一个进程的 404。已把端口改为 `${HTTP_PORT:-8080}` / `${HTTPS_PORT:-8443}`，验证时使用 `HTTP_PORT=18080`。

### 数据库迁移

- 1 个 migration：`apps/api/migrations/0000_greedy_turbo.sql`
- 15 张表：users、auth_sessions、characters、character_versions、conversations、message_nodes、branches、generation_runs、wallets、wallet_ledger、payment_orders、payment_events、tariffs、sync_changes、audit_events
- 约束与索引已在集成测试中逐条触发。

---

## RISK

| ID  | 风险 / 未完成项                                          | 影响                       | 当前处理                                         | 何时关闭         |
| --- | -------------------------------------------------------- | -------------------------- | ------------------------------------------------ | ---------------- |
| R1  | 支付宝商户、ICP、AI 服务登记/评估/算法备案未完成         | 不能公开收费或提供模型服务 | 仅 demo/mock；充值禁用；页面公示                 | M3/M5 前         |
| R2  | DeepSeek 模型 ID、参数、价格、流式 usage 未在线核实      | 计费与模型行为不可承诺     | 不集成、不硬编码价格；tariff 表未填              | M3               |
| R3  | 认证、会话、对象级授权、CSRF、找回凭证未实现             | 不能接收真实用户           | 不开放注册；演示数据无用户身份                   | M1               |
| R4  | 同步协议、Dexie outbox、tombstone、分页、导出/导入未实现 | 不能跨设备续聊或带走数据   | 草稿仅本机；页面标注 M1                          | M1               |
| R5  | 世界书、Prompt 编译器、宏/正则、记忆、群聊未实现         | 不是完整酒馆               | 接口与页面 Gate 标注；不用占位冒充               | M2               |
| R6  | 真实支付、退款、对账 worker、unknown_usage 未实现        | 不能经营                   | mock provider + 领域规则；按钮禁用               | M3               |
| R7  | 2 vCPU / 2 GiB / 3 Mbps 未压测                           | 容量未知                   | 限流 120/min、body 64 KiB、DB pool 6；不宣称容量 | M5               |
| R8  | 法律文本（协议/隐私/退款/联系）为草案                    | 不能替代正式合规文本       | 页面明确标注草案；不接收真实数据/付款            | 正式上线前       |
| R9  | GitHub Actions workflow 未在远端实际跑过                 | CI 结果未验证              | 本地等价命令全部通过；workflow 已提交            | 首次 push/PR     |
| R10 | Docker 镜像仅在本机验证；基础镜像经镜像站拉取            | 生产拉取路径未验证         | 本地 build/up/curl 全栈通过                      | 部署演练         |
| R11 | 截图是 M0 演示证据                                       | 可能被误读为支付/AI 已开通 | banner + 页面文案 + 本报告三处声明               | 持续             |
| R12 | 演示套餐金额/积分为草案                                  | 可能被误读为生效价格       | 明确标注「草案」「未生效」；不发起支付           | M3 tariff 校验后 |

## 预估 ECS 资源（设计预算，非压测结果）

目标：阿里云杭州，Ubuntu 24.04，2 vCPU / 2 GiB / 40 GiB ESSD / 3 Mbps 固定带宽。

| 组件                     | 预算                                                |
| ------------------------ | --------------------------------------------------- |
| Caddy                    | 64–128 MB                                           |
| Fastify API              | 256–512 MB（单进程；DB pool 6；body limit 64 KiB）  |
| PostgreSQL               | 384–640 MB（含 shared_buffers / work_mem 保守配置） |
| 系统 + page cache + 余量 | 512–768 MB                                          |
| 合计                     | 约 **1.2–1.8 GiB**，需保留 OOM 余量                 |

未验证：p95 首屏、同步延迟、实际出网带宽、内存峰值、并发上限。M5 前必须用真实或等效 2C/2GiB/3Mbps 环境实测，不得用本机结果代替。

---

## NEXT（M1 工单）

1. **认证与授权**：users / auth_sessions、密码哈希、HttpOnly/Secure/SameSite Cookie、登录限流、会话撤销、对象级 `owner_user_id` 校验测试（IDOR）。
2. **完整领域 schema 增补**：personas / lorebooks / lore_entries / presets / regex_rules / memory_items；每个实体带 revision 与 owner 约束。
3. **同步协议**：`GET /api/sync?cursor=`、`POST /api/mutations`、`sync_changes` 写入、乐观 CAS、幂等 `opId`、`resync_required`。
4. **Dexie 本地层**：草稿 + outbox + 缓存版本；离线修改显示 pending，不冒充云端已保存。
5. **消息图 API**：分页 `GET /api/conversations/:id/messages?before=&limit=`，保留分支结构；Swipe/编辑/删除 tombstone 端到端。
6. **导出/导入**：完整 ZIP + manifest + hashes；导入 dry-run、路径穿越/压缩炸弹防护；V2/V3 角色卡 round-trip fixtures。
7. **M1 验收测试**：双设备并发 CAS、离线草稿、删除后旧设备重连、数千消息分页、导出/恢复；更新 `M1_REPORT.md`。
8. **继续补齐**：CI 首次远端运行、生产 compose profile（不跑构建）、备份/恢复脚本草案。

---

## SCREENSHOTS

真实 Vite + Fastify 本地进程渲染，Playwright Chromium 截图；截图前已把 sticky header 改为静态流：

| 文件                                    | 内容                             | 大小  |
| --------------------------------------- | -------------------------------- | ----- |
| `artifacts/screenshots/home.png`        | 首页 `/`                         | 418 K |
| `artifacts/screenshots/wallet.png`      | 钱包 `/wallet`，所有充值按钮禁用 | 393 K |
| `artifacts/screenshots/chat.png`        | 聊天 `/chat`，本地演示回复       | 386 K |
| `artifacts/screenshots/home-mobile.png` | 手机首页额外证据                 | 1.7 M |

生成命令：`pnpm screenshots`（或 `pnpm e2e` 同时跑冒烟与截图）。

**声明**：这些截图证明页面由真实代码渲染、支付按钮确实禁用；它们**不证明**支付宝商户准入、ICP 备案、AI 服务登记/安全评估/算法备案已完成，也不包含任何真实支付成功记录。

---

## 未验证事项（明确标记）

- GitHub Actions 未在远端运行（R9）。
- Docker 基础镜像在本机通过镜像站获取；生产网络路径未验证（R10）。
- DeepSeek 官方 API 的模型 ID、价格、`safety_check` 字段映射未在线核对（R2）。
- 2C/2GiB/3Mbps 容量、带宽、内存峰值未实测（R7）。
- 真实支付宝沙箱签名、退款、对账未实现（R6）。
- 法律文本未经过专业审阅（R8）。
- 移动端真机（iOS Safari / Android WebView）未验证；Playwright 使用 Pixel 7 模拟。
