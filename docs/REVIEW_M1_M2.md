# Review — M0 / M1 / M2 对照 kickoff 文档

日期：2026-11-18  
范围：`71b4d45..25f0384` 的现有实现（M0 底座、M1 云端、M2 角色卡/世界书/Prompt 起步）  
方法：逐项对照 `AGENTS.md`、`GOAL.md`、`PRODUCT_SPEC.md`、`DELIVERY_PLAN.md`、
`DATA_MODEL.md`、`ENGINE_SPEC.md`、`SYNC_STORAGE.md`、`BILLING_GENERATION.md`、
`TEST_STRATEGY.md`、`SECURITY_OPERATIONS.md`，并运行本地全量测试/E2E 复核。

## 结论

- **M0 Gate：达成**。工程底座、真实页面、迁移、领域不变量、截图与 CI 均有证据。
- **M1 Gate：基本达成，带明确缺口**。账号/对象授权、角色 CAS、消息图分页、同步游标、
  Dexie outbox（手动投递）、JSON 导出/恢复、跨设备聊天已跑通；账号生命周期、自动 outbox、
  完整 ZIP/备份仍未完成。
- **M2：未达 Gate，但核心编辑器路径已贯通**。角色卡 V2/V3、世界书 CRUD/触发、
  Prompt 编译器、预览端点与云端聊天 Prompt 预览面板已落地；正则、记忆、Preset Manager、
  群聊、宏/快捷命令尚未完成。
- **不是 V1.0 可发布状态**：没有 DeepSeek 调用、没有真实支付、没有完成 ICP/AI/支付宝手续，
  站点未公开上线。

## 文档逐项核对

| 文档要求                                                           | 证据                                              | 状态                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| AGENTS：pnpm/TS strict/Zod/Drizzle/Fastify/React/Vite/Dexie/Docker | `package.json`、各包、`compose.yaml`              | 达成                                                        |
| AGENTS：路由不堆在一个文件、底层模块可测                           | `apps/api/src/routes/*`、`packages/*`             | 达成；`conversations` 仓储较大但按领域拆分                  |
| AGENTS：不提交密钥/用户数据；`.env.example` 占位                   | `.env.example`、git 扫描无命中                    | 达成                                                        |
| GOAL：云端权威、可导出、隐私、透明计费                             | PostgreSQL 仓储、`/api/export`、账本规则          | 部分：ZIP/备份/账号删除未完成                               |
| SECURITY：认证、对象级授权、限流、日志最小化                       | scrypt + DB session、owner 过滤、路由限流、redact | 达成；CSRF token/邮箱验证/密码找回缺失                      |
| SECURITY：CSRF 防护                                                | 本次新增 Origin 白名单/同 Host 校验               | 已补；仍建议后续加 CSRF token                               |
| DATA_MODEL：消息图不可变、Swipe、tombstone、CAS                    | `message-graph`、`conversations` 仓储、测试       | 达成（API 层）                                              |
| DATA_MODEL：所有用户内容 owner 过滤                                | 仓储查询统一 owner 条件；他人资源 404             | 达成                                                        |
| SYNC_STORAGE：云权威 + Dexie 缓存/outbox                           | 云端 CRUD、Dexie outbox、`/api/sync`              | 部分：无实时推送、日志不裁剪、outbox 需手动同步             |
| SYNC_STORAGE：删除跨端传播                                         | tombstone + sync change + 测试                    | 达成（拉取模式）                                            |
| BILLING：冻结/结算/账本幂等                                        | 领域/DB 约束、mock 回调测试                       | 达成（领域与 mock）；真实支付宝未接                         |
| ENGINE：确定性世界书、递归/预算                                    | `tavern-core/world-info` + 9 测试                 | 达成（关键词）；正则未实现                                  |
| ENGINE：确定性 Prompt 编译、预算、provenance                       | `prompt-engine/compiler` + 7 测试                 | 达成（基础）；无记忆、无真实 tokenizer                      |
| ENGINE：导入/导出 round-trip                                       | `compat/character-card` + 8 测试                  | 达成（V2/V3 JSON/PNG 导入、JSON 导出）；PNG 导出/头像未完成 |
| TEST_STRATEGY：单测、DB 集成、E2E、故障注入                        | 73 tests / 13 files；16 E2E；DB 约束测试          | 部分：故障注入矩阵尚未系统化                                |
| DELIVERY M0                                                        | 报告、截图、CI                                    | 达成                                                        |
| DELIVERY M1                                                        | 报告、导出/恢复、2,500 条分页                     | 基本达成，缺口见上                                          |
| DELIVERY M2                                                        | 角色卡/世界书/Prompt 起步                         | 未达 Gate                                                   |

## PRODUCT_SPEC 功能状态（P0/P1）

| ID  | 功能                               | 状态                                                                                                      |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F01 | 注册/登录/会话/找回                | 部分：登录/注册/退出/撤销；无找回、邮箱验证、账号删除                                                     |
| F02 | 流式聊天/停止/编辑/删除/重生成     | 部分：云端用户消息、编辑/删除 API；无模型流、无 Swipe/编辑 UI                                             |
| F03 | Swipe/分支/书签/搜索/群聊          | 部分：消息图/分支 API、分支切换 UI；无群聊/书签/搜索                                                      |
| F04 | 云保存/分页/同步/跨设备            | 部分：分页、游标、跨设备 E2E；无自动实时合并                                                              |
| F05 | 角色卡字段/版本                    | 部分：CRUD/版本/CAS；完整字段 UI 未做完                                                                   |
| F06 | V2/V3 JSON/PNG 导入导出            | 部分：JSON/PNG 导入、JSON 导出；PNG 导出/头像缺失                                                         |
| F07 | Persona                            | 部分：CRUD/版本 CAS + Prompt 预览选择；尚未绑定到具体会话                                                 |
| F08 | 世界书                             | 部分：CRUD/关键词与安全正则触发/递归/预算；`at_depth` 渲染未做                                            |
| F09 | Prompt Manager                     | 部分：编译器 + 预览 + Preset 段落 CRUD；作者注释/深度渲染/宏未做                                          |
| F10 | 宏与变量                           | 部分：白名单宏（char/user/persona/random/pick）与 seeded 确定性展开；变量写入与条件宏未做                 |
| F11 | 正则                               | 部分：安全子集引擎 + CRUD + 预设/用户输入阶段应用 + 试运行；环视/反向引用不支持，模型输出与展示阶段未接线 |
| F12 | Quick Reply/命令                   | 未开始                                                                                                    |
| F13 | 长期记忆                           | 部分：手动事实/事件/摘要 CRUD、锁定、会话绑定与版本；自动摘要/时间线/回退未做                             |
| F14 | 检索/引文                          | 部分：确定性词面检索、命中词与来源展示；向量检索/引文跳转未做                                             |
| F15 | DeepSeek 适配/安全/usage           | 端口类型占位；无调用                                                                                      |
| F16 | 积分/订单/支付宝                   | 领域+DB+mock；真实支付未接，按钮禁用                                                                      |
| F17 | 导出/导入/备份/删除账号            | JSON 导出/恢复；ZIP、附件、备份恢复、账号删除未完成                                                       |
| F18 | 主题/阅读/快捷键/移动端            | 响应式/基础可访问性；主题/快捷键未做                                                                      |
| F19 | 模型配置/TTS/外部媒体              | 未开始                                                                                                    |
| F20 | 风险日志/申诉/年龄/AI 标识/后台    | 未开始（仅有文案）                                                                                        |
| F21 | 首页/套餐/协议/隐私/退款/联系/截图 | 达成（真实页面，支付状态真实）                                                                            |

## 本次 review 修复的问题

1. **云端聊天 409 会丢用户草稿**（`CloudChat`）
   - 原：409 后调用 `loadConversation`，会清空 `draft` 与待重试请求，和页面文案“保留输入”不一致。
   - 修：刷新分支时 `preserveComposer`，保留草稿/requestId；重新设置冲突提示。
   - 证据：跨设备 E2E 中 B 推进分支、A 发送冲突后输入仍在，点击“重试发送”成功。

2. **Prompt 组件包含集合只按 sourceId 键控**
   - 原：`included` 用 `sourceId`，不同 kind 的相同 id（如世界书 `history:0` 与历史 `history:0`）会互相污染。
   - 修：统一 `componentKey(kind, sourceId)`；新增回归测试，保证世界书被裁掉时历史仍保留。

3. **写请求缺少 Origin/CSRF 防线**
   - 原：只有 SameSite=Lax，没有服务端 Origin 校验。
   - 修：非 GET/HEAD/OPTIONS 请求若带 Origin，必须来自配置的 CORS origin 或同 Host；
     无 Origin 的服务端调用/webhook 放行。新增 403 `ORIGIN_FORBIDDEN` 测试。
   - 仍建议后续加 CSRF token + 导出二次认证。

## 后续 review 修复（2026-11-18 P1）

1. **普通聊天禁止 `system` 角色**
   - `appendMessageRequestSchema.role` 改为 `z.literal("user")`；公开 API 不再接受 `system`。
   - 路由固定 `role: "user"` 与 `actorRef: {kind:"user"}`。
   - 历史中的 `system` 行（导入/旧数据）在 Prompt 预览中降级为 `role:"user"`，内容加
     `[用户提供的系统消息]` 前缀，并返回 warning；不得冒充平台策略。
   - 回归：公开 API 提交 `role:"system"` → 400；系统历史不进入 `systemPrompt`。

2. **Prompt 加载器过滤软删除**
   - 先校验 `lorebooks.deletedAt IS NULL`，再只加载 `lore_entries.deletedAt IS NULL` 的条目。
   - 回归：删除条目 → 预览不再命中；删除整本世界书 → 旧引用不再命中。

> 这两项修复后，`docs/REVIEW_M1_M2.md` 的 F08/F09 状态也已按实际代码更新。

## 测试证据

- `pnpm typecheck`：PASS
- `pnpm lint`：PASS（184 files）
- `DATABASE_URL=... pnpm test`：**129 passed / 19 files**
- `pnpm e2e`：**22 passed / 10 skipped**
- 角色卡：8 条 compat 测试 + API 导入/导出 round-trip
- 世界书：12 条（环、预算、词边界、scanDepth、确定性、正则触发/门控/非法表达式）
- 安全正则：21 条（子集语法、捕获替换、嵌套量词/环视/反向引用拒绝、步数与输入上限）
- Prompt：7 条（顺序、预算、历史裁剪、digest、key 冲突）
- 正则集成：6 条（CRUD/CAS/隔离、写入校验、试运行、两阶段应用、世界书正则触发、mutation）
- 记忆：6 条领域单测 + 4 条 DB 集成（CRUD/CAS、跨用户会话拒绝、检索注入、跨会话排除）
- 宏：9 条领域单测 + 1 条 DB 集成（四处展开、未知宏警告、digest 复现）
- M1 集成：11 条（认证、CAS、分页 2,500、同步、导出/恢复、Prompt 预览）

## 开放风险（按优先级）

**P0 / 阻塞公开发布**

- 真实支付宝未接入，站点未上线；H5 状态必须如实选“未上线”。
- ICP / AI 服务登记、安全评估、算法备案、商户准入未完成。
- DeepSeek 模型调用未接，无法完成真实聊天闭环。

**P1 / M2 发版前必须解决**

- `/chat` 无模型回复、Swipe/编辑 UI、自动同步/实时合并。
- 自动摘要、向量检索/引文跳转、宏变量写入与条件宏；正则的模型输出/展示阶段与聊天渲染接线。
- 账号生命周期：邮箱验证、密码找回、账号删除、会话列表/单会话撤销。
- 导出：ZIP/附件/备份恢复/流式导出；outbox 自动投递。
- 2C/2GiB/3Mbps 压测与恢复演练。

**P2 / 体验与运维**

- 主题/字体/快捷键/阅读模式、TTS/外部媒体适配器、管理后台、风险日志。
- sync 日志裁剪与 `resync_required`、审计事件、管理员二次确认。

## 建议

- 本次 PR 只包含 **review 报告 + 3 个修复**，不扩功能范围。
- M2 下一刀优先做 Prompt 预览 UI + Persona/世界书 CRUD，把引擎接到用户可见路径；
  之后再进入 M3 的 DeepSeek adapter/generation_run。
- 不将本报告视为任何合规、备案或支付批准的证明。
