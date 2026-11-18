# 测试架构与故障注入矩阵

## 分层测试

- **Pure unit / property**：世界书触发、宏替换、Prompt 编排、分支图、价格整数计算、格式转换；无网络无 DB。
- **Contract / integration**：真实 PostgreSQL 容器、SSE 模拟 DeepSeek、模拟支付宝签名回调；覆盖事务隔离/并发。
- **E2E 视觉操作**：Playwright 桌面+移动端，不读源代码的普通用户操作路径；模拟两台设备与断网。
- **Fault injection**：进程 kill、HTTP 402/429、延迟/截断 usage、重复支付通知、网络随机抖动、存储空间不足。
- **Compatibility fixtures**：真实可再分发的 V2/V3 PNG/JSON、世界书、预设、JSONL、DeepSeek ZIP 样本（必须脱敏）。

## 生命周期统一模板

每个状态机在 `describeLifecycle(spec, adapter)` 注册：states、events、guards、transition invariant、idempotency key、compensation、persist/load、concurrent actors、fault adapters。不是让所有生命周期继承同一个继承树，而是共享**可配置合约测试**并由领域适配器实现。

## 角色/订阅者故障注入

将“角色”扩展为操作订阅者：React 客户端、同步 Worker、Prompt Compiler、Provider Adapter、Wallet Ledger、Payment Webhook、DB、外部支付接口。

| 故障编号 | 注入点                             | 必须观察到的结果                                 |
| -------- | ---------------------------------- | ------------------------------------------------ |
| T01      | 世界书 A 触发 B，B 又触发 A        | 有限深度终止、无无限循环、记录触发链             |
| T02      | 生成中另设备修改角色卡             | 该生成仍使用固定快照，新生成才用新版             |
| T03      | 同一父节点连点重生成               | 产生多个候选；不覆盖旧分支                       |
| T04      | 两设备 CAS 同一分支 head           | 一方成功，一方 409/新分支；无乱序覆盖            |
| T05      | 用户刷新、断网、重连               | 同一 run_id 可查询；不会重复请求上游             |
| T06      | 上游已返回部分 token，最终安全拒绝 | 临时内容撤回，不产生正式可见回复；费用按既定政策 |
| T07      | 上游 usage 缺失但请求可能已收费    | unknown_usage，冻结可清理且不多扣，告警对账      |
| T08      | 支付宝通知并发到达 10 次           | 仅记一笔用户充值入账，订单状态一致               |
| T09      | 余额不足时 30 并发生成             | 不出现负余额，受全站并发/账户额度约束            |
| T10      | 用户删除消息后旧设备上线           | tombstone 生效，不复活已删记录                   |
| T11      | 导入含路径穿越 ZIP / HTML 注入卡片 | 拒绝危险载荷，原始库未破坏                       |
| T12      | 浏览器清理 IndexedDB               | 登录后从 PostgreSQL 重新拉取数据                 |
| T13      | PostgreSQL 宕机于预留和结算之间    | 恢复时对账任务解决孤儿冻结并无重复扣费           |
| T14      | 备份恢复到新机                     | 用户/剧情/分支/账本正确，索引与权限无错误        |
| T15      | 过大的上下文 + 3Mbps 瓶颈          | 请求体限额/背压生效，API 不 OOM                  |
| T16      | 1000 轮聊天含多次 swipe / 分支     | 只加载分页片段，旧消息与分支可检索               |
| T17      | 两笔退款和多次重复回调竞态         | 不退超额、不产生负余额或双退                     |
| T18      | 主题/宏/正则外部导入恶意脚本       | 无服务端执行，无 DOM XSS，无账本越权             |

## 验收 Gate（每个里程碑）

- CI: Typecheck/Lint/Unit/Integration/Build 全绿。
- 修改到金额/余额/模型调用接口，必须增加事务与故障注入测试。
- 每个领域用不变量做 property-based 测试；导入导出用 round-trip；UI 使用可访问性与键盘测试。
- 生产负载门槛需在真实或等效 2C/2GiB+3Mbps 环境实测；阈值由测试结果与用户目标确定，不编造吞吐 QPS。
- 重要生命周期必须能通过结构化事件串联重建，而不是在日志里搜索自由文本。
