import type { ApiMeta, Capability } from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { APP_VERSION } from "../version.js";

function capabilities(config: AppConfig, cloudEnabled: boolean): readonly Capability[] {
  return [
    {
      key: "chat",
      enabled: false,
      gate: "M3",
      note: "聊天页面是可交互的本地演示壳；未调用 DeepSeek。",
    },
    {
      key: "character-cards",
      enabled: false,
      gate: "M2",
      note: "角色卡 V2/V3 导入导出与版本编辑尚未实现。",
    },
    {
      key: "world-info",
      enabled: false,
      gate: "M2",
      note: "世界书触发、递归与预算尚未实现。",
    },
    {
      key: "memory",
      enabled: false,
      gate: "M2",
      note: "长期记忆与检索尚未实现。",
    },
    {
      key: "cloud-sync",
      enabled: cloudEnabled,
      gate: "M1",
      note: cloudEnabled
        ? "PostgreSQL 权威存档、增量游标与 Dexie outbox 已接入；实时推送与多端合并仍待完善。"
        : "PostgreSQL 权威存档与 Dexie 同步尚未接入。",
    },
    {
      key: "billing",
      enabled: config.paymentsEnabled,
      gate: "M3",
      note: "支付宝商户准入未完成；充值按钮保持禁用。",
    },
    {
      key: "auth",
      enabled: cloudEnabled,
      gate: "M1",
      note: cloudEnabled
        ? `邮箱密码登录与会话已接入；公开注册${config.signupEnabled ? "已开启" : "仍由运营者控制"}。`
        : "公开注册与登录未启用。",
    },
    {
      key: "export",
      enabled: cloudEnabled,
      gate: "M1",
      note: cloudEnabled
        ? "JSON 导出/导入已接入；完整 ZIP 与附件将在后续 Gate 补齐。"
        : "完整 ZIP 导出与导入尚未实现。",
    },
  ];
}

export function metaRoutes(config: AppConfig, cloudEnabled: boolean): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/meta",
      async (): Promise<ApiMeta> => ({
        product: "续月记 Xuyueji",
        version: APP_VERSION,
        demo: true,
        paymentsEnabled: false,
        aiEnabled: false,
        reason: cloudEnabled
          ? "M1 云端基础：账号会话、角色版本 CAS、会话消息图、分页、同步游标与 JSON 导出/导入已接入；模型调用与真实支付未启用。"
          : "M0 工程底座：真实页面、领域不变量与数据库迁移已运行；公开注册、模型调用与真实支付未启用。",
        capabilities: [...capabilities(config, cloudEnabled)],
        serverTime: new Date().toISOString(),
      }),
    );
  };
}
