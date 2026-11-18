import { Link } from "react-router-dom";

import {
  DemoDataNote,
  Eyebrow,
  GateBadge,
  PageHeader,
  StatusPill,
} from "../components/Primitives.js";
import { useApiMeta } from "../lib/use-api-meta.js";

const GATES = [
  { gate: "M0", title: "工程底座与支付材料页面", state: "已完成" },
  { gate: "M1", title: "账号、领域数据模型与云端存档", state: "进行中" },
  { gate: "M2", title: "完整文本酒馆引擎", state: "待开始" },
  { gate: "M3", title: "DeepSeek 运行时与积分闭环", state: "待开始" },
  { gate: "M4", title: "酒馆体验、兼容与运营功能", state: "待开始" },
  { gate: "M5", title: "发布审查与容量测试", state: "待开始" },
] as const;

const FAQ = [
  {
    q: "现在能注册、保存云端或充值吗？",
    a: "账号登录、角色与会话云端存档已接入（M1）。公开注册取决于部署配置 PUBLIC_SIGNUP_ENABLED；真实支付仍未启用，充值按钮全部禁用，套餐数字只是展示草案。",
  },
  {
    q: "聊天内容会发给 DeepSeek 吗？",
    a: "不会。当前聊天页在浏览器本地生成演示回复，状态提示会标注“未调用模型”。正式接入在 M3，并且安全级别由服务端强制。",
  },
  {
    q: "我的草稿存在哪里？",
    a: "输入框草稿保存在浏览器 IndexedDB（本机），不会上传。云端权威存档、跨设备同步与导出在 M1 实现。",
  },
  {
    q: "为什么还有套餐和价格？",
    a: "用于展示充值页的真实布局与禁用状态，便于后续支付商户审核预备。它们不是生效价格，也不构成要约。",
  },
  {
    q: "这些页面是静态占位吗？",
    a: "不是。首页、聊天、钱包、协议与帮助页都由 React 代码渲染，钱包余额与 API 状态来自本地运行的 Fastify 服务；未实现的模块会用明确的 Gate 标注，不冒充完成。",
  },
] as const;

export function HelpPage() {
  const api = useApiMeta();
  const status =
    api.status === "connected"
      ? { tone: "connected" as const, label: `API 已连接 · ${api.meta.version}` }
      : api.status === "offline"
        ? { tone: "offline" as const, label: "API 未连接 · 页面静态可用" }
        : { tone: "loading" as const, label: "正在连接 API…" };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="帮助 / Status"
        title="先看状态，再看功能。"
        description="这一页把“已经能做什么”和“还没有做什么”分开写。未完成的能力不会被描述成已上线。"
        aside={<StatusPill status={status.tone} label={status.label} />}
      />

      <div className="grid gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_1fr]">
        <section className="glass-card rounded-3xl p-5 sm:p-6">
          <Eyebrow>当前服务端状态</Eyebrow>
          {api.status === "connected" ? (
            <>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["产品", api.meta.product],
                  ["版本", api.meta.version],
                  ["演示模式", api.meta.demo ? "是" : "否"],
                  ["模型调用", api.meta.aiEnabled ? "已启用" : "未启用"],
                  ["真实支付", api.meta.paymentsEnabled ? "已启用" : "未启用"],
                  ["服务端时间", new Date(api.meta.serverTime).toLocaleString("zh-CN")],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border hairline bg-night-950/40 p-3">
                    <dt className="text-[11px] text-mist-400">{label}</dt>
                    <dd className="mt-1 text-sm text-paper-50">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-6 text-mist-300">{api.meta.reason}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {api.meta.capabilities.map((capability) => (
                  <div
                    key={capability.key}
                    className="flex items-start justify-between gap-2 rounded-xl border hairline bg-night-950/30 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-mist-200">{capability.key}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-mist-400">
                        {capability.note}
                      </p>
                    </div>
                    <span
                      className={[
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
                        capability.enabled
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-paper-50/5 text-mist-400",
                      ].join(" ")}
                    >
                      {capability.enabled ? "on" : capability.gate}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed hairline px-4 py-8 text-center text-sm text-mist-300">
              {api.status === "offline"
                ? "API 未连接。页面仍由真实前端代码渲染，但服务端状态不可用。"
                : "正在读取服务端状态…"}
            </div>
          )}
        </section>

        <section className="glass-card rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>交付 Gate</Eyebrow>
            <GateBadge gate="M1 进行中" tone="ready" />
          </div>
          <ol className="mt-4 space-y-3">
            {GATES.map((gate) => (
              <li
                key={gate.gate}
                className="flex items-start gap-3 rounded-xl border hairline bg-night-950/30 p-3"
              >
                <span className="font-display text-lg text-moon-300">{gate.gate}</span>
                <div className="flex-1">
                  <p className="text-sm text-paper-50">{gate.title}</p>
                  <p className="mt-0.5 text-[11px] text-mist-400">{gate.state}</p>
                </div>
              </li>
            ))}
          </ol>
          <DemoDataNote>
            Gate 是交付顺序，不是功能阉割。P0 与 P1 都是 V1.0 发版门槛；M5 未满足前不会声称 V1.0
            可发布。
          </DemoDataNote>
        </section>
      </div>

      <section className="mx-4 mb-10 rounded-3xl border hairline bg-night-900/40 p-5 sm:mx-6 sm:p-8">
        <Eyebrow>常见问题</Eyebrow>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-2xl border hairline bg-night-950/40 p-4">
              <summary className="cursor-pointer text-sm font-medium text-paper-50">
                {item.q}
              </summary>
              <p className="mt-2 text-xs leading-6 text-mist-300">{item.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/chat"
            className="inline-flex min-h-10 items-center rounded-full bg-moon-400 px-4 py-2 text-xs font-semibold text-night-950 hover:bg-moon-300"
          >
            进入聊天演示
          </Link>
          <Link
            to="/wallet"
            className="inline-flex min-h-10 items-center rounded-full border border-moon-400/40 px-4 py-2 text-xs text-moon-200 hover:bg-moon-400/10"
          >
            查看钱包与禁用状态
          </Link>
          <Link
            to="/contact"
            className="inline-flex min-h-10 items-center rounded-full border hairline px-4 py-2 text-xs text-mist-200 hover:bg-paper-50/5"
          >
            联系与运营信息
          </Link>
        </div>
      </section>
    </div>
  );
}
