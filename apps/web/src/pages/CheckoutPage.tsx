import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import {
  DemoDataNote,
  DisabledPrimaryButton,
  Eyebrow,
  GateBadge,
} from "../components/Primitives.js";
import { DRAFT_PACKAGES } from "../lib/demo-data.js";
import { usePresentationMode } from "../lib/use-presentation.js";

/**
 * Real rendered payment-page shell for merchant review. It deliberately shows
 * a disabled payment button: the Alipay merchant account is not open, so this
 * page must never create an order or jump to a checkout.
 */
export function CheckoutPage() {
  const { state } = useAuth();
  const presentation = usePresentationMode();
  const pack = DRAFT_PACKAGES[0];
  const orderDate = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const demoOrderNo = `${presentation ? "XYJ" : "DEMO"}-${orderDate}`;
  const account =
    state.status === "authenticated"
      ? state.session.user.email
      : presentation
        ? "访客"
        : "演示访客（未登录）";
  const amountLabel = presentation
    ? (pack?.amountLabel ?? "¥6（草案）").replace("（草案）", " 参考价")
    : (pack?.amountLabel ?? "¥6（草案）");
  const pointsLabel = presentation
    ? (pack?.pointsLabel ?? "60 积分（草案）").replace("（草案）", "")
    : (pack?.pointsLabel ?? "60 积分（草案）");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Eyebrow>支付 / Checkout</Eyebrow>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-paper-50">确认积分订单</h1>
        <GateBadge gate="支付未开通" />
      </div>
      <p className="mt-2 text-sm leading-7 text-mist-300">
        {presentation
          ? "请确认本次积分套餐与金额。支付服务开放后，可在此完成付款；提交支付前不会创建真实订单。"
          : "这是真实渲染的订单确认页，用于展示当前支付状态。支付宝商户准入完成前，确认支付按钮保持禁用，页面不会创建真实订单、不会跳转支付宝，也不会产生扣款。"}
      </p>

      <div id="checkout-card" className="paper-card mt-6 rounded-3xl p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {presentation ? "积分套餐" : "商品 / 服务"}
            </p>
            <h2 className="mt-1 font-display text-2xl text-night-900">{pack?.name ?? "体验包"}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {presentation ? "续月记积分充值" : "续月记积分充值 · 演示套餐（草案，不构成要约）"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-night-900">{amountLabel}</p>
            <p className="text-xs text-slate-500">{pointsLabel}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">{presentation ? "订单号" : "演示订单号"}</dt>
            <dd className="font-mono text-xs text-night-900">{demoOrderNo}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">账号</dt>
            <dd className="text-night-900">{account}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">支付方式</dt>
            <dd className="text-night-900">
              {presentation ? "支付宝（支付服务暂未开放）" : "支付宝（未开通）"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">应付金额</dt>
            <dd className="text-lg font-semibold text-night-900">{amountLabel}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p id="checkout-disabled-reason" className="text-xs leading-6 text-amber-900">
            {presentation
              ? "支付服务暂未开放。当前页面不会发起支付请求或扣款；积分套餐与最终价格以正式公示为准。"
              : "支付宝商户入驻与网站支付产品尚未获批。当前页面仅为真实界面展示，不发起支付请求；套餐金额与积分是展示草案，最终价格与服务端 tariff 表以正式公示为准。"}
          </p>
        </div>

        <div className="mt-4">
          <DisabledPrimaryButton describedBy="checkout-disabled-reason">
            {presentation ? "支付服务暂未开放" : "确认支付（未开通）"}
          </DisabledPrimaryButton>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/wallet"
            className="text-xs text-slate-600 underline underline-offset-4 hover:text-night-900"
          >
            返回积分与套餐
          </Link>
          <Link
            to="/refunds"
            className="text-xs text-slate-600 underline underline-offset-4 hover:text-night-900"
          >
            {presentation ? "退款说明" : "退款说明（草案）"}
          </Link>
        </div>
      </div>

      {presentation ? null : (
        <div className="mt-5">
          <DemoDataNote>
            支付页截图用于商户审核材料；它证明页面真实存在且支付按钮确实禁用，
            不证明支付宝产品已开通或任何付款成功。
          </DemoDataNote>
        </div>
      )}
    </div>
  );
}
