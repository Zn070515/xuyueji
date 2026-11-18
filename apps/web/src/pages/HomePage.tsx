import { Link } from "react-router-dom";

import { Eyebrow, GateBadge, StatusPill } from "../components/Primitives.js";
import { CAPABILITY_NOTES, DRAFT_PACKAGES, PLANNED_FEATURES } from "../lib/demo-data.js";
import { useApiMeta } from "../lib/use-api-meta.js";

const PRINCIPLES = [
  {
    title: "故事属于你",
    body: "云端主存档、离线可读缓存、可移植 ZIP/JSONL/角色卡导出。删除会跨设备传播，不用旧缓存复活。",
    glyph: "卷",
  },
  {
    title: "分支不覆盖历史",
    body: "消息是不可变节点，Swipe 是候选兄弟，编辑旧消息会生成新分支；已确认的剧情不会被静默改写。",
    glyph: "枝",
  },
  {
    title: "每一分都说得清",
    body: "积分冻结、结算、退款全走不可变账本；余额与价格由服务端决定，客户端无法伪造。",
    glyph: "账",
  },
] as const;

export function HomePage() {
  const api = useApiMeta();
  const status =
    api.status === "connected"
      ? { tone: "connected" as const, label: `API 已连接 · ${api.meta.version}` }
      : api.status === "offline"
        ? { tone: "offline" as const, label: "API 未连接 · 静态页面仍可浏览" }
        : { tone: "loading" as const, label: "正在连接 API…" };

  return (
    <div>
      <section className="relative overflow-hidden border-b hairline">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-24 lg:pt-20">
          <div>
            <Eyebrow>AI 文本互动 · 长篇角色扮演 · 文学创作</Eyebrow>
            <h1 className="mt-5 font-display text-5xl leading-[1.12] tracking-tight text-paper-50 sm:text-6xl">
              续月记
              <span className="mt-3 block text-2xl font-normal tracking-[0.08em] text-moon-300 sm:text-3xl">
                把月光下的故事，续成可以带走的长卷。
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-mist-200">
              面向中国大陆成年用户的完整文本 AI 酒馆：角色卡、世界书、Persona、宏与正则、群聊、
              分支、长期记忆、跨设备云端存档与积分账本。不是套壳聊天，也不是“无限制”服务。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/chat"
                className="inline-flex min-h-12 items-center rounded-full bg-moon-400 px-6 py-3 text-sm font-semibold text-night-950 transition-transform hover:-translate-y-0.5 hover:bg-moon-300"
              >
                进入聊天演示
              </Link>
              <Link
                to="/wallet"
                className="inline-flex min-h-12 items-center rounded-full border border-paper-50/20 px-6 py-3 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-50/5"
              >
                查看积分与价格原则
              </Link>
              <StatusPill status={status.tone} label={status.label} />
            </div>

            <p className="mt-5 max-w-2xl text-xs leading-6 text-mist-400">
              当前为 M0 演示环境：页面由真实代码渲染，聊天为本地演示，
              <span className="text-moon-300">不调用 DeepSeek、不开放注册、不接收真实付款</span>。
            </p>
          </div>

          <aside className="glass-card relative rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-mist-400">M0 运行状态</p>
                <p className="mt-2 font-display text-2xl text-paper-50">工程底座已建立</p>
              </div>
              <span className="rounded-full border border-moon-400/40 px-3 py-1 text-[11px] text-moon-200">
                demo
              </span>
            </div>

            <dl className="mt-6 space-y-4">
              {CAPABILITY_NOTES.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-4 border-b border-paper-50/10 pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <dt className="text-sm text-paper-50">{item.label}</dt>
                    <dd className="mt-1 text-xs leading-5 text-mist-400">{item.detail}</dd>
                  </div>
                  <span className="shrink-0 rounded-full bg-paper-50/5 px-2.5 py-1 text-[11px] text-moon-300">
                    {item.value}
                  </span>
                </div>
              ))}
            </dl>

            <div className="mt-6 rounded-2xl border border-moon-400/20 bg-night-950/50 p-4">
              <p className="text-xs leading-6 text-mist-300">
                <span className="text-moon-300">演示角色：</span>
                星月书店店主 · 原创虚构角色，不含任何真实用户或受版权保护的角色卡。
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <article key={item.title} className="paper-card rounded-2xl p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-night-900 font-display text-sm text-moon-300">
                {item.glyph}
              </span>
              <h2 className="mt-4 font-display text-xl text-night-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>V1.0 功能版图</Eyebrow>
            <h2 className="mt-3 font-display text-3xl text-paper-50">P0 与 P1 都是发版门槛</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-mist-300">
              里程碑只是交付顺序，不是功能阉割。下列能力已建立领域边界或计划在对应 Gate
              实现；未实现的模块不会用静态占位页冒充完成。
            </p>
          </div>
          <GateBadge gate="M0 · 进行中" tone="ready" />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="glass-card flex flex-col rounded-2xl p-5 transition-colors hover:border-moon-400/30"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg text-paper-50">{feature.title}</h3>
                <GateBadge
                  gate={feature.gate}
                  tone={feature.state === "已建立底座" ? "ready" : "planned"}
                />
              </div>
              <p className="mt-3 flex-1 text-sm leading-7 text-mist-300">{feature.description}</p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-mist-400">
                {feature.state}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y hairline bg-night-900/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <Eyebrow>计费与数据</Eyebrow>
            <h2 className="mt-3 font-display text-3xl leading-tight text-paper-50">
              价格会公示，余额会记账，数据能带走。
            </h2>
            <p className="mt-4 text-sm leading-7 text-mist-300">
              积分是整数记账单位。生成开始前冻结本次上限，结束后按实际用量结算并释放余款；
              支付回调重复到达只入账一次。模型价格按 DeepSeek 官方实时文档校验后写入带生效期的
              tariff 表，不在前端硬编码。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["冻结", "生成前锁定上限积分"],
                ["结算", "终态按 usage 扣费"],
                ["退款", "订单与账本留痕"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border hairline bg-night-950/40 p-4">
                  <p className="text-sm font-medium text-moon-200">{title}</p>
                  <p className="mt-1 text-xs leading-6 text-mist-400">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="paper-card rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  充值套餐（草案）
                </p>
                <p className="mt-2 font-display text-2xl text-night-900">未生效 · 按钮禁用</p>
              </div>
              <span className="rounded-full border border-amber-700/30 bg-amber-100 px-3 py-1 text-[11px] text-amber-900">
                M3 前不收款
              </span>
            </div>

            <ul className="mt-6 divide-y divide-slate-200">
              {DRAFT_PACKAGES.map((pack) => (
                <li key={pack.name} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-night-900">{pack.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{pack.note}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-night-900">{pack.pointsLabel}</p>
                    <p className="text-xs text-slate-500">{pack.amountLabel}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
              套餐金额与积分仅为展示草案，不构成要约。支付宝商户准入未完成前，
              不创建订单、不接收真实付款。
            </p>

            <Link
              to="/wallet"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-night-900 px-5 py-2.5 text-sm font-medium text-paper-50 transition-colors hover:bg-night-800"
            >
              查看钱包页面
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="paper-card overflow-hidden rounded-3xl">
          <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
            <div className="p-8 sm:p-10">
              <Eyebrow>从哪里开始</Eyebrow>
              <h2 className="mt-3 font-display text-3xl leading-tight text-night-900">
                先看真实页面，再看下一道 Gate。
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-600">
                首页、聊天壳与充值页都由本地运行的前端代码渲染。三张真实截图会作为支付宝
                商户审核的预备材料，但截图不等于任何支付或 AI 服务已获批准。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/chat"
                  className="inline-flex min-h-11 items-center rounded-full bg-night-900 px-5 py-2.5 text-sm font-medium text-paper-50 hover:bg-night-800"
                >
                  体验聊天壳
                </Link>
                <Link
                  to="/help"
                  className="inline-flex min-h-11 items-center rounded-full border border-night-900/20 px-5 py-2.5 text-sm font-medium text-night-900 hover:bg-night-900/5"
                >
                  查看当前状态
                </Link>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 bg-night-900 p-8 text-mist-200 sm:p-10">
              <p className="font-display text-xl text-moon-300">M0 交付清单</p>
              {[
                "pnpm / TS strict monorepo",
                "Fastify + PostgreSQL 迁移",
                "领域不变量：CAS / Swipe / 支付幂等",
                "React 页面与 Dexie 草稿边界",
                "Playwright 真实截图",
              ].map((item) => (
                <p key={item} className="flex items-center gap-3 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-moon-400" aria-hidden="true" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
