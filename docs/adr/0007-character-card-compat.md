# ADR-0007 Character Card V2/V3 兼容与未知字段保留

状态：Accepted（2026-11-18）

## 决策

1. **V2/V3 JSON 解析**
   - 支持 `spec: "chara_card_v2"` 与 `chara_card_v3`；legacy 扁平卡按 V2 处理并给出 warning。
   - 已知字段规范化到 `CharacterPayload`；`creator`、`character_version`、`character_book`、V3 的 `nickname/assets/source/group_only_greetings/dates` 等未映射字段全部保留。
   - 未知顶层字段与未知 `data` 字段保存在 payload `extensions.__xuyueji_card_unknown` 中；导出时合并回对应层级，保证 `import → export → re-import` 不丢字段。
   - 已知字段在导出时覆盖原始未知值，避免编辑后仍输出旧设定。

2. **PNG 文本块**
   - 解析 PNG 的 `tEXt` / 未压缩 `iTXt` 文本块，读取 keyword `chara`（V2）或 `ccv3`（V3）；优先 `ccv3`。
   - 文本内容支持 base64 JSON，也兼容直接 JSON 文本。
   - 导出 PNG 时写入 `tEXt`（base64 JSON），替换已有 `chara/ccv3` 块；CRC32 自行计算。
   - 压缩 `iTXt`/`zTXt` 尚未支持；不做静默降级，避免误读。

3. **API / UI**
   - `POST /api/characters/import`：JSON 或 PNG base64，body limit 25 MiB；解析失败返回 400 `INVALID_CHARACTER_CARD`。
   - `GET /api/characters/:id/export?format=v2|v3`：导出当前 active version；不导出密码/会话/支付信息。
   - Web `/characters` 支持选择 `.json/.png` 导入，显示未知字段计数与 warning；支持 V2/V3 JSON 导出。

4. **安全边界**
   - 角色卡一律视为不可信文本；不执行内嵌 JS/HTML，不因 `character_book` 自动激活世界书。
   - PNG 只读取文本块，不渲染、不存储图像；头像文件存储与 PNG 导出（需要真实头像）留到后续。
   - 导入内容仍走 `characterPayloadSchema` 的 strict HTTP 契约与长度限制。

## 替代方案

- **只在客户端解析**：服务端无法验证与持久化，跨设备不可用；选择服务端解析 + 客户端预览。
- **丢弃未知字段**：违反 V2/V3 round-trip 要求；选择保留并报告。
- **直接复用 SillyTavern 代码**：许可证与耦合风险；自写纯 TS 解析器。
- **把 character_book 直接写入 lorebooks**：语义映射与触发规则未完成，先保留原文，M2 世界书切片再处理。

## 已知缺口

- 头像/PNG 导出：导入 PNG 只取角色卡文本，不保存原图；导出 PNG 需要已有头像文件，尚未接入附件存储。
- `character_book` 只保留，不激活；世界书触发/预算/递归在后续 M2 切片。
- V3 `assets` 只 round-trip，不解析/渲染。
- 压缩 iTXt/zTXt 文本块未支持。

## 来源

- `PRODUCT_SPEC.md` F06、`ENGINE_SPEC.md`「导入/导出兼容」
- `packages/compat/src/character-card.ts` 与其测试
- `apps/api/src/routes/characters.ts` import/export 路由
