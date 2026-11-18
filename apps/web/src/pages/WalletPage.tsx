import { Link } from "react-router-dom";

import {
  DemoDataNote,
  DisabledPrimaryButton,
  Eyebrow,
  GateBadge,
  PageHeader,
  StatusPill,
} from "../components/Primitives.js";
import { DRAFT_PACKAGES } from "../lib/demo-data.js";
import { useDemoState } from "../lib/use-demo-state.js";

const LIFECYCLE = [
  {
    step: "01",
    title: "创建订单",
    body: "服务端生成商户订单号，金额以人民币分保存；前端不能提交价格或积分。",
  },
  {
    step: "02",
    title: "支付回调",
    body: "验签、校验商户号/APPID/金额/币种；同一外部交易与商户订单只入账一次。",
  },
  {
    step: "03",
    title: "积分入账",
    body: "钱包与不可变账本在同一短事务更新；重复通知、重试与进程重启不改变结果。",
  },
  {
    step: "04",
    title: "消费与退款",
    body: "生成前冻结上限，终态按实际 usage 结算；退款受订单与账本双重审计。",
  },
] as const;

export function WalletPage() {
  const demo = useDemoState();
  const serverState = demo.status === "connected" ? demo.state : null;
  const balanceLabel =
    demo.status === "connected" ? `${serverState?.wallet.availablePoints ?? 0} 积分` : "—";
  const status =
    demo.status === "connected"
      ? { tone: "connected" as const, label: "服务端演示余额已连接" }
      : demo.status === "offline"
        ? { tone: "offline" as const, label: "API 未连接 · 显示静态骨架" }
        : { tone: "loading" as const, label: "正在读取服务端演示状态…" };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="积分 / Wallet"
        title="余额由服务端决定，付款按钮保持关闭。"
        description="当前钱包页展示真实页面、真实禁用状态与计费原则。支付宝商户准入未完成前，页面不会创建订单、不会跳转收银台、也不会接收真实付款。"
        aside={<StatusPill status={status.tone} label={status.label} />}
      />

      <div className="grid gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="paper-card rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">演示账户余额</p>
              <p className="mt-3 font-display text-5xl text-night-900">{balanceLabel}</p>
              <p className="mt-2 text-xs text-slate-500">
                可用 {serverState?.wallet.availablePoints ?? 0} · 冻结{" "}
                {serverState?.wallet.reservedPoints ?? 0}
              </p>
            </div>
            <span className="rounded-full border border-amber-700/30 bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-900">
              未开通支付
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white/60 p-4">
            <p className="text-sm font-medium text-night-900">为什么按钮是灰的？</p>
            <p id="payment-disabled-reason" className="mt-1 text-xs leading-6 text-slate-600">
              支付宝网站支付与商户资质尚未获批，V1.0 当前仅允许沙箱/模拟回调。
              在正式准入完成前，我们不会展示可点击的购买按钮，也不会生成真实订单。
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["可用积分", String(serverState?.wallet.availablePoints ?? 0)],
              ["冻结积分", String(serverState?.wallet.reservedPoints ?? 0)],
              ["账本记录", String(serverState?.ledgerEntries ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white/50 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-night-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              积分变动
            </p>
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm text-slate-600">暂无积分变动</p>
              <p className="mt-1 text-xs text-slate-500">
                演示环境不写入伪造的已付款记录；触发模拟回调后只会增加账本计数，不展示虚构交易。
              </p>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section id="packages" className="glass-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Eyebrow>充值套餐</Eyebrow>
                <h2 className="mt-2 font-display text-2xl text-paper-50">草案展示</h2>
              </div>
              <GateBadge gate="M3 前不收款" />
            </div>

            <ul className="mt-5 space-y-3">
              {DRAFT_PACKAGES.map((pack) => (
                <li key={pack.name} className="rounded-2xl border hairline bg-night-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-paper-50">{pack.name}</p>
                      <p className="mt-1 text-[11px] leading-5 text-mist-400">{pack.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-moon-300">{pack.pointsLabel}</p>
                      <p className="text-[11px] text-mist-400">{pack.amountLabel}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <DisabledPrimaryButton describedBy="payment-disabled-reason">
                      支付未开通
                    </DisabledPrimaryButton>
                  </div>
                </li>
              ))}
            </ul>

            <DemoDataNote>
              套餐金额与积分是展示草案，不构成要约。正式价格必须来自服务端带生效期的 tariff
              表，并经官方价格校验；当前页面不发起任何支付请求。
            </DemoDataNote>

            <Link
              to="/wallet/checkout"
              className="mt-3 inline-flex min-h-10 items-center rounded-full border border-moon-400/40 px-4 py-2 text-xs text-moon-200 hover:bg-moon-400/10"
            >
              查看订单确认页（支付未开通）
            </Link>
          </section>

          <section className="glass-card rounded-3xl p-5 sm:p-6">
            <h2 className="font-display text-xl text-paper-50">退款与对账</h2>
            <p className="mt-2 text-sm leading-7 text-mist-300">
              未消费积分的退款、已消费积分的处理与支付宝原路退回，都需要正式签约后按公示规则执行。
              订单与钱包账本分开保存，聊天删除不会删除依法应留存的财务记录。
            </p>
            <Link
              to="/refunds"
              className="mt-4 inline-flex min-h-10 items-center rounded-full border border-moon-400/40 px-4 py-2 text-xs font-medium text-moon-200 hover:bg-moon-400/10"
            >
              阅读退款说明（草案）
            </Link>
          </section>
        </div>
      </div>

      <section className="mx-4 mb-8 rounded-3xl border hairline bg-night-900/40 p-5 sm:mx-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>资金生命周期</Eyebrow>
            <h2 className="mt-2 font-display text-2xl text-paper-50">
              订单、冻结与账本不是同一条记录
            </h2>
          </div>
          <p className="max-w-xl text-xs leading-6 text-mist-400">
            generation_run、message_node 与 wallet_ledger 生命周期独立，通过 run_id 追溯；
            任何一次充值成功最多增加一次积分。
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LIFECYCLE.map((item) => (
            <article key={item.step} className="rounded-2xl border hairline bg-night-950/40 p-4">
              <p className="font-display text-2xl text-moon-400/80">{item.step}</p>
              <h3 className="mt-2 text-sm font-medium text-paper-50">{item.title}</h3>
              <p className="mt-1 text-xs leading-6 text-mist-400">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
