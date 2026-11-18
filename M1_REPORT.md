# M1_REPORT — 账号、云端存档与同步基础

日期：2026-11-18  
状态：**M1 云端基础已实现并验证；聊天 UI 接入云端仍是下一刀**  
基线：`DELIVERY_PLAN.md` Gate M1、`SYNC_STORAGE.md`、`DATA_MODEL.md`

---

## SUMMARY

M1 把 M0 的纯演示接口推进为可用的云端存档基础：

- **账号与会话**：邮箱 + 密码注册/登录/退出/退出所有设备；scrypt 密码哈希；HttpOnly/SameSite 会话 Cookie；服务端 `auth_sessions` 可撤销；登录/注册限流；`PUBLIC_SIGNUP_ENABLED` 默认关闭。
- **对象级授权**：角色、会话、消息、同步与导出查询全部按认证用户 `owner_user_id` 过滤；他人资源返回 404，不泄露存在性。
- **角色版本 CAS**：创建角色、列角色、读取详情、追加版本、软删除；过期 `expectedActiveVersionId` 返回 409。
- **会话与消息图**：创建会话/主线、追加 user/system 消息、生成 assistant 候选、切换 Swipe、编辑旧消息生成新分支、tombstone 删除；`client_request_id` 唯一索引保证重试不重复追加。
- **分页**：递归 CTE 从 branch head 向根遍历，每页最多 200 条；2,500 条消息测试分 50 页取完，不重复、不遗漏。
- **同步**：`sync_changes` 变更日志 + opaque cursor + 200 条分页；`POST /api/mutations` 支持 persona / lorebook / preset / regex_rule / memory_item 的 opId 幂等、CAS 冲突、软删除与同步记录。
- **浏览器缓存**：Dexie 草稿 + outbox；`opId` 幂等、跨重开保留、失败 5 次进入 failed。
- **导出/恢复**：JSON 导出包含角色版本、会话、分支与消息图；导入在新账号下重建新 ID，保留父子关系、响应组与分支 head；不包含密码、会话、API Key 或支付凭据。
- **Web**：`/login`、`/register`、`/settings`（账号、导出/导入、outbox 状态）、`/characters`（真实云端角色 CRUD 与 CAS 冲突提示）、`/chat`（登录后加载云端会话、分页消息、发送用户消息、分支切换；未登录仍为本地演示）；导航按登录态显示账号。

M1 **没有**：personas/lorebooks/presets/regex/memory 的专属 UI 与完整导入、ZIP/附件、实时推送、密码找回/邮箱验证、账号删除、备份恢复、模型调用、真实支付。outbox 已支持在设置页手动投递到 `/api/mutations`；自动后台投递与冲突解决面板仍未完成。

> M2 起步已在同一代码库落地：Character Card V2/V3 JSON/PNG 导入与 V2/V3 JSON 导出、未知字段 round-trip，见 `docs/adr/0007-character-card-compat.md`。

---

## DESIGN

### 认证

- 密码：Node `crypto.scrypt`（N=16384, r=8, p=1, keylen=64），格式 `scrypt$N$r$p$salt$key`，校验用 `timingSafeEqual`。
- 会话：32 字节随机 token 只存 cookie；数据库只存 SHA-256 hash。Cookie `HttpOnly`、`SameSite=Lax`、`Path=/`，生产应设 `COOKIE_SECURE=true`。
- 会话解析每次请求都查数据库，检查 `revoked_at`、`expires_at`、用户 `status`；`last_used_at` 最多 5 分钟写一次。
- 登录失败对不存在的邮箱也执行一次 scrypt，降低账号枚举的时序信号；没有验证码/登录锁定计数。
- 注册、登录有独立路由限流（默认 5/min、10/min，可配置）。

### 数据模型（migration 0001–0003）

新增/修改：

- `users`：`email_normalized` 唯一、`password_hash`、`display_name`、`updated_at`。
- `auth_sessions`：`last_used_at`。
- `personas` / `persona_versions`
- `lorebooks` / `lore_entries`
- `presets`
- `regex_rules`
- `memory_items`
- `sync_mutations`：`(owner_user_id, op_id)` 唯一，保存幂等结果。
- `conversations.active_branch_id`、mode check。
- `message_nodes.client_request_id` + 部分唯一索引 `(owner_user_id, client_request_id) WHERE client_request_id IS NOT NULL`。
- 软删除列：characters、personas、lorebooks、presets、regex_rules、memory_items。

当前 schema 共 23 张表。

### 消息图与分页

- branch 行在追加/切换时 `SELECT ... FOR UPDATE`，用 `revision` 做 CAS；冲突返回 409。
- 消息节点不可变；编辑生成新节点 + 新分支，原标题/原分支保留。
- 删除是 `tombstone_at`，同事务写 `sync_changes(op=delete)`。
- 分页 SQL 从 branch head 递归向上，`LIMIT limit+1`；`before` 先用从 head 向上的 CTE 验证确在该分支路径，再取更旧的页。第一页是最新一页（页内按旧→新），后续页向更旧翻。

### 同步与 outbox

- `GET /api/sync?cursor=`：base64url opaque cursor；按 owner 过滤、sequence 升序、200 条分页；非法 cursor 返回 400。
- `POST /api/mutations`：每批 1–100 条；逐条事务：
  1. 插入 `sync_mutations` 回执（`opId` 幂等）；重复 opId 直接返回已存结果。
  2. 按实体类型校验 payload、CAS、写实体、写 `sync_changes`、保存结果。
  3. 业务拒绝（404/409/无效 payload）作为 result 返回，不抛 500。
- Dexie outbox 只保存 intent，不代表已保存；`opId` 重复入队返回同一行；5 次失败进入 failed。
- **投递**：设置页可手动把 pending outbox 发往 `/api/mutations`；accepted/conflict/rejected 会更新本地状态。自动后台投递与冲突 diff 面板仍未完成。

### 导出/恢复

- 导出：`GET /api/export`，`application/json` + attachment，包含 manifest/counts/notes、角色+版本、会话+分支+消息；人格/世界书/预设/正则/记忆以只读数组导出。
- 导入：`POST /api/import`，body limit 20 MiB；校验 manifest 版本；角色与会话全部生成新 ID；消息父子、响应组、branch head 重新映射；不覆盖现有行。
- 不支持导入的数组会计入 `skipped` 并明确返回。
- 不包含钱包/订单，符合“财务账单另行提供”的边界。

---

## TESTS（实际结果）

环境：Windows 11，Node 24.22.0，pnpm 12.14.0，PostgreSQL 17 容器。

| 命令                           | 结果                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`               | **PASS**                                                                                              |
| `pnpm lint`                    | **PASS**，152 files，0 错误                                                                           |
| `pnpm test`（无 DATABASE_URL） | **PASS**，37 passed / 11 skipped                                                                      |
| `DATABASE_URL=... pnpm test`   | **PASS**，**48 passed / 10 files**                                                                    |
| `pnpm build`                   | **PASS**：Web JS 466.33 kB（gzip 145.06 kB），CSS 37.20 kB；API `server.js` 140.68 kB                 |
| `pnpm e2e`                     | **PASS**，**16 passed / 4 skipped**（桌面 + Pixel 7，含跨设备云端消息与 H5 支付页）                   |
| `docker compose build`         | **PASS**：api 297 MB，caddy 95 MB                                                                     |
| `docker compose up -d --wait`  | **PASS**：db/api/caddy healthy                                                                        |
| 全栈 Caddy 冒烟                | **PASS**：登录 200、`/me` 200、`POST /api/mutations` 200 accepted、`/api/export` 200、`/api/sync` 200 |
| `pnpm user:create`             | **PASS**：创建受控账号（随后清理测试账号）                                                            |

### 覆盖的关键行为

- 注册/登录/退出/会话撤销；重复邮箱 409；错误密码 401。
- 他人角色 404；角色版本过期 CAS 409；正确 CAS 生成 v2。
- 消息追加幂等（同 requestId 重试返回同一节点）；Swipe 候选不删除旧候选；切换候选只改 branch head。
- 两设备同 revision 写入：一个成功、一个 409。
- 编辑旧消息生成新分支，原标题保留；tombstone 后 `tombstone_at` 非空。
- 2,500 条消息分 50 页，总数与唯一 ID 均为 2,500；第一页末条是最新消息，最后一页首条是最旧消息。
- 同步 pull 首次有变更、用 nextCursor 追平后为空、非法 cursor 400。
- mutation create/replay/update/stale/delete：replay 不覆盖；stale 返回 conflict；删除后 `deleted_at` 非空；sync 日志包含 preset/lorebook。
- JSON 导出→新账号导入：角色/会话/消息数量正确，内容与顺序保留，新 ID 不与源账号冲突。
- Dexie outbox：opId 幂等、重开数据库保留 pending、5 次失败进入 failed。
- E2E：注册 → 创建云端角色 → 保存 v2 → 导出 JSON → 退出登录。

### 修复记录

1. **分页方向反了**：CTE 从 head 向根递增 depth，第一版用 `depth DESC` + 反转，导致页内顺序为“新→旧”。改为 `depth ASC` 后反转，页内才是旧→新；`before` 条件改为 `depth > beforeDepth`。
2. **`before` 路径校验写反**：原实现从 before 向根遍历并检查 head，head 永远不在祖先集合；改为从 head 向根遍历，检查 before 是否存在。
3. **注册限流误伤测试**：路由级 5/min 与全局限流叠加，多个用户注册后 429；限流上限改为配置项 `AUTH_SIGNUP_RATE_LIMIT_MAX` / `AUTH_LOGIN_RATE_LIMIT_MAX`。
4. **创建角色成功但提示被清空**：`selectDetail` 会清空 notice，而创建流程先设 notice 再调用它；改为先刷新详情再设置 notice。
5. **Playwright outputDir 层级错误**：配置目录是 `apps/web`，`../../../artifacts` 落到了 Desktop；改回 `../../artifacts`。
6. **PostgreSQL 时间格式**：Drizzle `timestamp mode:string` 返回 `2026-11-18 09:31:38+00`，不是 ISO；在 DTO 边界统一 `toIso()`，避免浏览器/客户端解析差异。
7. **测试并行互踩数据库**：M1 与 schema 测试都 TRUNCATE 同一库；Vitest 设置 `fileParallelism: false` 串行执行文件。

---

## RISK / 未完成

| ID  | 项                                                                    | 影响                                   | 下一步                      |
| --- | --------------------------------------------------------------------- | -------------------------------------- | --------------------------- |
| R1  | ~~`/chat` 未接云端~~ **已关闭**：登录后已加载云端会话并支持双设备 E2E | —                                      | 已完成                      |
| R2  | outbox 无自动后台投递；冲突无 diff 面板                               | 设置页可手动同步，离线修改仍需用户触发 | 自动投递 + 冲突 UI          |
| R3  | persona/lorebook/preset/regex/memory 无专属 UI；lore entries 未写入   | 这些实体只有 schema、mutation 与导出口 | M2 编辑器                   |
| R4  | 导入跳过非角色/会话数组                                               | 导出可读但恢复不完整                   | 补导入与 round-trip fixture |
| R5  | JSON 导出全量在内存中                                                 | 大账号可能冲高 API 内存                | 流式/分片 + 上限            |
| R6  | 无 ZIP/附件/头像文件                                                  | 角色卡与媒体迁移不完整                 | M2/M4                       |
| R7  | 无实时推送；sync 日志不裁剪；无 `resync_required`                     | 多端最终一致依赖拉取；日志无限增长     | 保留策略 + 过期重建         |
| R8  | 无邮箱验证、密码找回、账号删除、会话列表                              | 账号生命周期不完整                     | M1 收尾/M4                  |
| R9  | 无 CSRF token，仅 SameSite=Lax + JSON 契约                            | 跨站写请求仍有残留风险                 | 加 Origin 校验/CSRF token   |
| R10 | 无验证码/登录失败锁定                                                 | 暴力破解依赖限流                       | 风控与告警                  |
| R11 | 未做 2C/2GiB 压测                                                     | 容量未知                               | M5                          |
| R12 | 法律文本仍为草案                                                      | 不能替代正式合规文本                   | 正式上线前                  |

---

## NEXT（M1 收尾 / 进入 M2 前）

1. **outbox 自动化**：在手动同步之上加后台投递与冲突 diff 面板；冲突保留本地草稿，不静默覆盖。
2. **补全实体导入**：personas/lorebooks/lore_entries/presets/regex/memory，以及导出/导入 round-trip fixtures。
3. **云端聊天补充**：消息编辑/Swipe UI、tombstone 删除入口、未读/冲突提示；模型回复生成仍在 M3。
4. **账号生命周期**：邮箱验证、密码找回、删除账号与聊天、会话列表/单会话撤销。
5. **同步运维**：`sync_changes` 保留窗口、`resync_required`、日志裁剪与全量重建。
6. **安全**：Origin/CSRF 校验、登录失败锁定、审计事件、导出二次认证。
7. 通过后再进入 **M2 完整文本酒馆引擎**（世界书、Prompt 编译器、宏/正则、记忆、角色卡兼容）。

---

## SCREENSHOTS

M1 更新后的真实截图（Playwright，本地 Vite + Fastify + PostgreSQL）：

- `artifacts/screenshots/home.png` — 首页，显示 M1 账号/云端状态
- `artifacts/screenshots/wallet.png` — 钱包，充值仍禁用
- `artifacts/screenshots/chat.png` — 未登录时的本地聊天演示（登录后 `/chat` 切换为云端会话）
- `artifacts/screenshots/home-mobile.png` — 手机首页

支付宝 H5 审核截图（本地真实页面，支付按钮禁用）：

- `artifacts/screenshots/h5-home.png` — 首页
- `artifacts/screenshots/h5-service.png` — 积分套餐/服务页
- `artifacts/screenshots/h5-payment.png` — 订单确认页（展示模式；支付服务暂未开放）

截图使用 `?presentation=1` 展示模式：隐藏 M0/M1、Gate、演示模式、API/outbox/数据库等工程信息，
但支付状态仍真实显示「支付服务暂未开放」。说明与重新生成命令见
[`docs/PAYMENT_MATERIALS.md`](docs/PAYMENT_MATERIALS.md)。站点尚未公开上线，
表单中的 H5 状态应如实选择「未上线」，截图不等于站点已上线或支付已开通。

E2E 的注册/云端角色/导出流程见 `apps/web/e2e/cloud.spec.ts`，运行输出保存在 CI artifact。
