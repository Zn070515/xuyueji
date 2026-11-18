# ADR-0006 M1 账号、云端存档与同步

状态：Accepted（2026-11-18）

## 决策

1. **认证与会话**
   - 邮箱 + 密码；scrypt（N=16384, r=8, p=1）哈希；会话 token 只存 cookie，数据库存 SHA-256。
   - Cookie 使用 HttpOnly、SameSite=Lax、Path=/；生产由 `COOKIE_SECURE` 控制 Secure。
   - 每次受保护请求都查会话与用户状态；撤销/过期立即生效。
   - 注册默认关闭，`PUBLIC_SIGNUP_ENABLED=true` 才开放；运营者可用 `pnpm user:create` 创建账号。

2. **对象级授权**
   - 所有用户内容查询同时过滤 `id` 与 `owner_user_id`；他人资源返回 404，避免存在性泄露。
   - 服务端不信任客户端提交的 owner、价格、余额或安全级别。

3. **消息图与分页**
   - branch 行锁 + revision CAS；消息节点不可变；编辑生成新节点和新分支；删除是 tombstone。
   - `client_request_id` 部分唯一索引保证消息重试幂等。
   - 分页用从 branch head 向根的递归 CTE，`before` 先验证在路径上，再取更旧页；每页上限 200。

4. **同步**
   - `sync_changes` 与实体写入同事务；游标为 opaque base64url，按 owner 过滤。
   - `POST /api/mutations` 逐条事务：先写 `sync_mutations(owner, op_id)` 回执，再执行 CAS；重复 opId 直接返回已存结果。
   - 目前支持 persona / lorebook / preset / regex_rule / memory_item；角色与会话消息走专用路由。

5. **浏览器 outbox**
   - IndexedDB 只保存 intent；`opId` 幂等；失败 5 次进入 failed。
   - outbox 不等于已保存；UI 不得把 pending 显示成云端成功。

6. **导出/恢复**
   - 先交付 JSON（manifest + 实体数组），不包含密码、会话、Key 或支付凭据。
   - 导入生成新 ID、重映射父子/响应组/分支 head，不覆盖已有数据；不支持的数组明确 skip。
   - ZIP/附件/流式导出留到后续 Gate；当前 JSON 有内存上限风险。

## 替代方案

- **JWT 无状态会话**：撤销与“退出所有设备”需要额外黑名单，M1 选择数据库会话。
- **bcrypt/argon2**：scrypt 为 Node 内置，避免原生依赖；参数可后续升级并做登录时重哈希。
- **CRDT/实时协同**：M1 只做单用户多设备增量拉取与 CAS，不做多人共编。
- **Prisma**：继续 Drizzle，保留 SQL 可见性与 DB 约束测试。

## 已知缺口（必须保持可见）

- `/chat` 已接云端会话 API（会话列表、分页消息、发送用户消息、分支切换、双设备 E2E）；M3 前不生成角色回复。
- outbox 已支持设置页手动投递到 `/api/mutations`；自动后台投递与冲突 diff UI 仍未完成。
- persona/lorebook/preset/regex/memory 无专属 UI；lore entries 不在 mutation 内。
- 导入跳过非角色/会话数组。
- 无实时推送、sync 日志裁剪、`resync_required`、CSRF token、邮箱验证、密码找回、账号删除。
- 未做 2C/2GiB 压测。

这些缺口在 `M1_REPORT.md` 的 RISK 表中逐项登记。
