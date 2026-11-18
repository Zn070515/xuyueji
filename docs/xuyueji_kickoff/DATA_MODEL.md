# DATA MODEL — 关系型数据 + 内容版本 + 消息图

## 关键标识与隔离

使用 UUIDv7/ULID 等有序全局 ID（最终统一一种）；所有用户内容表必须有 `owner_user_id`，查询必须以认证用户作用域过滤。不可由前端提交 `owner_user_id` 获得授权。

## 领域表（候选，并非已执行 migration）

| 表                                       | 关键字段/约束                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                  | id, status, age_gate_state, created_at                                                                                                        |
| `auth_identities`, `sessions`            | credential_hash/provider, session_hash, expires_at, revoked_at                                                                                |
| `characters` / `character_versions`      | owner, id, active_version, payload_jsonb, format, created_at                                                                                  |
| `personas` / `persona_versions`          | 同上，复用版本方法                                                                                                                            |
| `lorebooks` / `lore_entries`             | owner, book_id, entry_id, rev, rule_jsonb, content, enabled, sort_key                                                                         |
| `presets`, `regex_rules`, `memory_items` | 独立 rev/验证规则/来源及权限                                                                                                                  |
| `conversations`                          | owner, title, mode, archived_at, deleted_at                                                                                                   |
| `conversation_members`                   | participant character refs, order, group speaker policy                                                                                       |
| `message_nodes`                          | id, owner, conversation_id, parent_id, response_group_id, role, actor_ref, content, created_at, origin_run_id, tombstone_at；不可原地覆盖正文 |
| `branches`                               | id, conversation_id, head_message_id, revision, label, deleted_at                                                                             |
| `generation_runs`                        | id, owner, branch_id, snapshot_digest, model_id, tariff_version, state, request_id unique(owner), cap_points, cost, usage_jsonb, error_code   |
| `generation_chunks`                      | 可选短期缓冲/恢复状态，不保证历史所有 Token 永久留存                                                                                          |
| `sync_changes`                           | monotonic sequence, owner, entity_type, entity_id, revision, op, changed_at                                                                   |
| `wallets`                                | owner, available_points, reserved_points, version，强一致读写                                                                                 |
| `wallet_ledger`                          | immutable id, owner, kind, delta_available, delta_reserved, ref_kind, ref_id, occurred_at，唯一外部事件约束                                   |
| `payment_orders`                         | merchant_trade_no unique, amount_fen integer, currency, status, provider_trade_no, paid_at                                                    |
| `refunds`                                | refund_no unique, order_id, amount_fen, status, ledger_ref                                                                                    |
| `tariffs`                                | version, model, effective_from, input/cache/output rates, margin, currency, rounding_rule                                                     |
| `audit_events`                           | actor, operation, target, metadata_sanitized, created_at                                                                                      |

## 消息图基本规则

- `parent_id` 指向同一会话的直接前驱，禁止环；消息节点有类型和原始作者。
- Swipe：同一个父节点下多个 assistant 候选节点（同一 response_group）；选择哪个由 branch head/选择指针决定。
- 编辑旧消息：创建一个新的版本节点替代该位置，并创建新分支，不覆盖原历史；引用其下游旧节点的分支仍可回放。
- 群聊：每条 assistant 节点附 speaker character version；发言策略写入会话配置快照。
- 对当前分支下生成：提交使用 `expected_branch_revision`；CAS 不符返回 `409 Conflict`，不能默认附加到错误分支。
- 共享祖先节点可被多个分支引用；清理时不得提前删除还有活跃分支引用的祖先。

## 修改与同步

- 角色卡/世界书/预设由**版本实体 + active_pointer** 组成。生成绑定确切版本 ID，不被后续编辑改变。
- 删除与撤销使用 tombstone + 增量日志，设备离线后恢复时必须先应用删除事件；过期游标触发全量重建缓存。
- 用户有权删除云端个人数据；要定义延时销毁、法律保留项及备份滞留窗口，不将支付账本与聊天正文一起硬删。
- 图片等二进制附件存文件目录，DB 保存文件 digest、owner、大小/MIME、扫描和引用关系；不要在 `jsonb` 中内嵌大文件。

## 索引与数据约束

- `message_nodes(conversation_id,created_at,id)`、`branches(conversation_id)`、`sync_changes(owner,seq)`。
- `wallet_ledger(owner,occurred_at)`、`generation_runs(owner,created_at)`；订单和 request_id 幂等唯一键。
- 故障安全：余额非负、预留非负、每个 run 最多一笔最终结算、每个 Alipay 订单最多一次确认入账，使用数据库约束+事务而非仅前端判断。
- `content`、外部卡片扩展与导入文件均是**不可信文本**，不能作为系统权限说明或可执行脚本直接运行。

## 迁移策略

- 每次 migration 含 up/down 或明确不可逆说明；schema version 随部署记录。
- 外部导入保留原始源文件 digest 与未识别元字段；标准化实体包含 `source_format` 和 `source_version`，用于回导测试。
- 禁止将公开产品所用 schema 直接捆绑内部 API 返回所有隐私字段；查询一律 DTO 白名单。
