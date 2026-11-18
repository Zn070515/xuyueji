# Model Generation + Billing — 双生命周期契约

## 模型、资费与调用

- 首批 `deepseek-flash` 与 `deepseek-v4-pro`；模型能力/价格通过配置表管理，按官方实时价格人工校验后发布新 `tariff_version`，不接受用户自报 Token。
- 服务端强制 DeepSeek 官方对公众服务所要求的 `safety_check: {level:'high'}`；具体字段映射随官方 API 版本更新，升级前运行合约测试。
- 审核 Token 若已经计入 output tokens，不得再次作为一笔相同模型的输出 token 扣费。
- 请求分配 `provider_request_id`（若上游提供）、内部 `run_id` 与唯一 `client_request_id`。明确响应 API 的不同 streaming usage 结构，不可将多个非最终 usage 相加。

## generation_run 状态机

```text
created -> reserved -> queued -> streaming -> finalizing -> completed
                  |       |           |            +-> rejected
                  |       |           +-> cancelled / failed / unknown_usage
                  +-------> aborted
```
所有终态必须不可逆且有 `finalized_at`。每次转移事件与版本号可审计；重试相同 `client_request_id` 返回现有 run 而不再次发起 DeepSeek 调用。

### 正常流程

1. 校验 session/模型权限/账号状态/内容安全；拿到已持久化的全部内容版本。
2. 计算 prompt budget，确定本次最高可接受费用与用户可见 `max_points`；用户额度不足直接拒绝。
3. DB **短事务**：锁钱包、保存 run+context snapshot digest、冻结上限积分、写审计事件，立即提交。
4. **事务外**调用 DeepSeek。SSE 发 started/delta；partial output 在客户端标记 pending，服务器可保留短期恢复缓冲但不要宣称已最终保存。
5. 成功、安全检查通过、有最终 usage：DB 短事务写不可变消息节点、推进分支 CAS、结算费用并释放余款，记录最终状态和 sync change。
6. 若分支版本冲突，应将结果保存为独立候选/分支并让用户选择；不得丢已计费回复或覆盖另一设备新内容。

### 失败处理

- `402` 上游余额不足：不创建最终回复，释放预留，暂停新请求并告警。
- `429`：指数退避但不得无条件重试已经开始生成的非幂等请求；客户端看到可恢复状态。
- 用户取消：尽可能取消上游；如果已计费且有 usage，按事先公布规则处理；无法确认 usage 则标记待对账。
- SSE 断开：查询 `GET /generations/:id`；**不自动再次调用模型**。服务器继续或取消以明确策略执行。
- 最终安全拒绝：撤回/不发布临时输出；建议正常用户误拒不收费（运营承担 API 账单），风险事件独立审计。
- 已消费上游 Token、终态 usage 缺失：`unknown_usage`，平台先承担未证实的费用/冻结按规则释放，告警对账；不得凭估算静默多扣。
- 支付或用户关闭页面发生在运行中：后台仍能最终结算；不依赖浏览器在线。

## 支付订单与钱包

订单生命周期：`created → pending → paid / closed / expired → partially_refunded / refunded`，不可用一个 `success` Boolean 代替。
充值入账：后端验签、校验商户号/APPID/金额/币种/订单状态，**同一外部交易 ID 和商户订单只能成功入账一次**；通知与主动查询都走同一个幂等确认逻辑。
钱包统一以整数积分记账，支付金额按人民币分整数保存；费率配置有生效版本；所有资金相关变化记账本 ledger。退款需同时处理已使用与未使用点数的业务规则，保留审计。

## 必须恒真的不变量

1. `available_points >= 0`，`reserved_points >= 0`。
2. 任一 `generation_run` 最多一笔最终结算，且一笔冻结必有释放/结算/待对账可见状态。
3. 每次充值成功最多增加一次积分；重复通知/重试/进程重启不改变结果。
4. 本地 JSON/IndexedDB 无法影响服务器钱包或价格。
5. 已完成生成存档与账本可以由 `run_id` 追溯，聊天删除不能删掉依法应留存的财务记录。
6. 实际费用和用户上限不符时不可无限透支；需要定义明确的保底/吸收差额策略。

## DeepSeek 账户供应侧

余额由官方余额接口定时读取，平台级阈值预警、暂停和预付资金计划独立于用户充值。无官方授权的自动充值 API 时不做网页登录/模拟支付自动充值。
