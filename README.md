# 续月记 Xuyueji

面向中国大陆成年用户的完整文本 AI 酒馆：角色卡、世界书、Persona、预设、宏、正则、群聊、
分支、长期记忆、跨设备云端存档与积分账本。

> **当前状态：M1 云端基础 + M2 起步（演示模式）**。账号会话、角色版本 CAS、云端聊天、
> 消息图分页、同步、JSON 导出/恢复、Character Card V2/V3 导入导出、世界书 CRUD 与
> 关键词/安全正则触发、
> Persona 版本编辑、Preset 段落管理、受限正则规则（安全子集、分阶段执行、步数上限）、
> 长期记忆（手动事实/事件/摘要、锁定、确定性检索注入）、白名单宏解释器、`at_depth` 世界书注入与展示层正则、
> Prompt 编译器与云端聊天内的 Prompt 预览面板已接入；
> DeepSeek 模型调用、真实支付与公开发布仍未启用。kickoff 文档不是已完成的软件。

## 文档基线

开工包位于 [`docs/xuyueji_kickoff/`](docs/xuyueji_kickoff/)。
阅读顺序：`AGENTS.md → GOAL.md → PRODUCT_SPEC.md → ARCHITECTURE.md → DATA_MODEL.md →
ENGINE_SPEC.md → SYNC_STORAGE.md → BILLING_GENERATION.md → TEST_STRATEGY.md → DELIVERY_PLAN.md`。

M0 的架构偏差与风险清单见 [`docs/adr/0005-m0-implementation.md`](docs/adr/0005-m0-implementation.md)；
实际命令结果与未验证事项见 [`M0_REPORT.md`](M0_REPORT.md) 与 [`M1_REPORT.md`](M1_REPORT.md)。

## 快速开始

前置：Node.js ≥ 22、pnpm 12、Docker（用于本地 PostgreSQL）。

```bash
cp .env.example .env
pnpm install
docker compose up -d --wait db
pnpm db:migrate
pnpm dev            # API :3000 + Web :5173
```

打开 <http://127.0.0.1:5173>。默认是演示模式：

- 未登录时聊天页在浏览器本地生成演示回复；登录后 `/chat` 使用 PostgreSQL 云端会话，
  但 M3 前只保存用户消息，**不会生成角色回复，也不会调用 DeepSeek**。
- 钱包页的充值按钮全部禁用，**不会创建订单或收款**。
- 账号、角色、会话与消息图可写入 PostgreSQL；公开注册由 `PUBLIC_SIGNUP_ENABLED` 控制。
- 钱包余额与支付演示数据仍在进程内，重启即清空。

公开注册默认关闭。本地创建一个受控账号：

```bash
DATABASE_URL=postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji \
XYJ_USER_EMAIL=demo@example.com \
XYJ_USER_PASSWORD='change-this-to-a-long-password' \
XYJ_USER_NAME='演示用户' \
pnpm user:create
```

或在 `.env` 中临时设置 `PUBLIC_SIGNUP_ENABLED=true`，通过 `/register` 注册。

## 验证命令

```bash
pnpm typecheck                  # TypeScript strict（TS 7）
pnpm lint                       # Biome
pnpm test                       # 领域 / 账单 / API / outbox 测试
pnpm build                      # Web (Vite) + API（tsup 单文件产物）
pnpm e2e                        # Playwright 桌面 + 手机（含注册/云端角色/导出）
pnpm screenshots                # 首页 / 钱包 / 聊天三张真实截图

# 含 PostgreSQL 集成与 M1 端到端契约
DATABASE_URL=postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji pnpm test

DATABASE_URL=postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji \
  pnpm db:migrate
DATABASE_URL=postgres://xuyueji:xuyueji_dev@127.0.0.1:5432/xuyueji \
  pnpm vitest run apps/api/src/db/schema.test.ts
```

截图输出在 `artifacts/screenshots/`（被 `.gitignore` 忽略，CI 作为 artifact 上传）。

## 目录

```text
apps/web                React 19 + Vite + Tailwind 4 + Dexie 草稿
apps/api                Fastify 5 + Drizzle + PostgreSQL
packages/domain         不可变实体、消息图、角色版本 CAS、生成状态机
packages/billing        积分钱包、不可变账本、支付回调幂等、mock provider
packages/contracts      Zod HTTP 契约（拒绝未知字段）
packages/tavern-core    世界书/预设/宏边界（M2 实现）
packages/prompt-engine  确定性 Prompt 编译器（M2 实现）
packages/compat         V2/V3/JSONL/ZIP 导入导出（M2 实现）
packages/sync           游标、outbox、CAS 冲突（M1 实现）
packages/provider       DeepSeek 适配端口（M3 实现）
infra                   Caddy、Web 镜像、部署配置
scripts                 迁移、调试与运维脚本
docs                    kickoff 文档与 ADR
```

## 已落实的硬边界（M0 + M1）

- **云端权威**：PostgreSQL 是权威存储；浏览器 Dexie 只保存草稿与 outbox，不是存档。
- **认证与归属**：scrypt 密码哈希、服务端会话、HttpOnly/SameSite Cookie；所有实体查询按
  `owner_user_id` 过滤，过期/撤销会话返回 401。
- **消息图不可变**：Swipe 是同一父节点下的兄弟候选，编辑旧消息生成新分支，不覆盖历史；
  `client_request_id` 唯一索引保证重试不重复追加消息。
- **角色版本 CAS**：过期 `expectedActiveVersionId` 返回 409，不静默覆盖另一台设备的修改。
- **同步契约**：`sync_changes` 游标、opaque cursor、200 条分页；Dexie outbox 用 `opId`
  幂等，失败 5 次进入 failed，设置页可手动投递到 `/api/mutations`。
- **导出可带走**：JSON 导出/导入包含角色版本、会话、分支与消息图，不含密码、会话令牌或支付凭据。
- **支付幂等**：同一商户订单与外部交易最多入账一次；重复通知/重试不重复加积分。
- **数据库约束**：钱包非负、账本 `unique_key`、订单号、run 的 `client_request_id` 唯一、
  `cost_points <= cap_points` 全部落在 PostgreSQL 约束上。
- **服务端闸门**：`DEMO_MODE` 默认 true；M0/M1 在 `DEMO_MODE=false` 时拒绝启动；支付与模型
  尚未实现，不能通过配置位绕过。

## 部署（未执行）

生产目标：阿里云杭州，Ubuntu 24.04，2 vCPU / 2 GiB / 40 GiB，3 Mbps。
构建在 CI 或台式机完成，**不在 ECS 上跑 `vite build` 或模型**。

```bash
docker compose build
SITE_ADDRESS=:80 docker compose up -d --wait
# 若本机 8080 已被占用（Windows 上可能表现为绑定失败但不报错）：
HTTP_PORT=18080 docker compose up -d --wait
# 访问 http://127.0.0.1:18080
```

正式上线前仍需完成 ICP/AI 服务相关手续、支付宝商户准入、价格与隐私审核。仓库中的
`DEMO_MODE`、mock 支付与演示数据不代表任何审批结果。生产 HTTPS 部署时应设置
`COOKIE_SECURE=true`；公开注册默认关闭，需显式设置 `PUBLIC_SIGNUP_ENABLED=true`。

## 许可证

商业项目，未授予开源许可；公开仓库不等于开源授权。文档中的第三方项目与接口按其官方许可证使用。
