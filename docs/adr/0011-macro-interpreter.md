# ADR-0011 白名单宏解释器与 Prompt 渲染顺序

日期：2026-11-18  
状态：已采纳（M2）  
关联：`docs/xuyueji_kickoff/ENGINE_SPEC.md`「宏、正则、脚本」、`PRODUCT_SPEC.md` F10

## 背景

ENGINE_SPEC 要求宏采用受限解释器：允许变量读取、模板插值和可测试的纯函数，
禁止访问 `process`、DOM、网络、文件系统、API Key 和钱包写操作；变量作用域与是否
注入模型必须显式。用户模板属于不可信输入，不能 `eval`。

## 决策

1. **单遍白名单替换** `packages/tavern-core/src/macros.ts`
   - 支持：`{{char}}`、`{{user}}`、`{{persona}}`、
     `{{random::a::b::c}}` / `{{pick::a::b::c}}`（seeded，确定性）、`\{{` 转义。
   - 替换值不会被再次扫描（无递归展开），避免 `{{char}}` 值里藏模板导致循环或注入扩散。
   - 未知宏原样保留并收集 warning，而不是静默删除。
   - 上限：模板长度（100k）、宏数量（1000）、单个 random/pick 选项数（50）；
     超限抛 `MacroError`，调用方降级为原文并记录警告。
   - 没有变量写入、没有表达式求值、没有时间/随机外部依赖；`random/pick` 由
     `seed + 宏序号` 决定，同一 preview 重放结果一致。

2. **渲染顺序**
   - 先展开宏，再执行正则（`transformText = regex(macros(text))`）。
   - 作用于用户输入、预设段、Persona 描述、世界书正文、示例与历史消息；
     角色卡字段只做宏展开（不做正则改写）。
   - 平台策略与收尾约束不参与任何用户模板处理。

3. **可解释性**
   - Prompt 预览响应新增 `macros: { used, warnings }`，并把宏警告并入
     `plan.warnings`；digest 仍由渲染后的内容计算。

## 影响

- 模板只能做「名字替换 + 从列表里确定性抽取」，表达力有限但可证明安全。
- `{{time}}`、`{{getvar}}`/`{{setvar}}`、递归宏、条件宏均未支持；需要时按同一白名单
  模型扩展，并保持「无外部状态、可复现」。
- 宏在服务端渲染，浏览器不执行用户模板；`display_only` 正则仍留给客户端展示层。

## 测试

- `packages/tavern-core/src/macros.test.ts`：9 条（名字替换、大小写、确定性抽取、
  不递归、未知宏、转义、未闭合、三类上限）。
- `apps/api/src/macros.integration.test.ts`：角色卡/Persona/预设/用户输入四处展开、
  未知宏警告、同 seed 两次 preview digest 与 systemPrompt 一致。
