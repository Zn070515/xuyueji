import type { ApiMeta, Capability } from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { APP_VERSION } from "../version.js";

function capabilities(config: AppConfig): readonly Capability[] {
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
      enabled: false,
      gate: "M1",
      note: "PostgreSQL 权威存档与 Dexie 同步尚未接入。",
    },
    {
      key: "billing",
      enabled: config.paymentsEnabled,
      gate: "M3",
      note: "支付宝商户准入未完成；充值按钮保持禁用。",
    },
    {
      key: "auth",
      enabled: false,
      gate: "M1",
      note: "公开注册与登录未启用。",
    },
    {
      key: "export",
      enabled: false,
      gate: "M1",
      note: "完整 ZIP 导出与导入尚未实现。",
    },
  ];
}

export function metaRoutes(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/meta",
      async (): Promise<ApiMeta> => ({
        product: "续月记 Xuyueji",
        version: APP_VERSION,
        demo: true,
        paymentsEnabled: false,
        aiEnabled: false,
        reason:
          "M0 工程底座：真实页面、领域不变量与数据库迁移已运行；公开注册、模型调用与真实支付未启用。",
        capabilities: [...capabilities(config)],
        serverTime: new Date().toISOString(),
      }),
    );
  };
}
