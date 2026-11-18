# ADR-0003 生成执行与资金交易分离

状态：Accepted

决策：冻结额度和最终结算分别为短事务，网络调用不持有 DB 事务；generation_run、message_node、wallet_ledger 以 run_id 关联但生命周期独立。

原因：支付状态不可由 UI 决定，AI 流可能取消、拒绝、超时或丢 usage；强一致钱包是经营底线。代价是需要 reconciliation worker 和 unknown_usage 状态。
