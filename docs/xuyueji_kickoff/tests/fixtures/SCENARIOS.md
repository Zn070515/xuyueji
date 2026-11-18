# Golden/故障测试样本制作清单

禁止包含真实私聊和有版权限制的完整商用角色卡。先构建原创的虚构角色（例如「星月书店店主」）和 300 轮可复制的生成数据。

- `v2_character.json` / `v3_character.json` / `v3_character.png`：必选字段、未知 extensions、多个开场白、内嵌 lorebook。
- `worldbook_cycles.json`：A→B→A 递归，检测循环和预算上限。
- `worldbook_priorities.json`：常驻 vs 关键词 vs 概率与嵌套，重复运行 digest 一致。
- `branches.jsonl`：A→B1/B2→C，检查 swipe 与不同分支的重建。
- `macros_regex.json`：正常输入、恶意模板表达式、灾难性回溯表达式。
- `provider_streams/`：成功/取消/安全拒绝/402/429/usage 缺失/乱序模拟。
- `alipay_callbacks/`：重复通知、签名错误、金额不符、订单不存在、退款重复。
- `sync/`：离线编辑、删除后旧设备重连、游标过期、多端同时修改角色。

上述是**待生成的 fixtures 任务清单**，不是已运行测试的证明。
