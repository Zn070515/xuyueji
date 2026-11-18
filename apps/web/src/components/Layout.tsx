import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { usePresentationMode } from "../lib/use-presentation.js";

const NAV_ITEMS = [
  { to: "/", label: "首页" },
  { to: "/chat", label: "聊天演示" },
  { to: "/characters", label: "角色" },
  { to: "/wallet", label: "积分" },
  { to: "/help", label: "帮助" },
] as const;

const MOBILE_ITEMS = [
  { to: "/", label: "首页", glyph: "月" },
  { to: "/chat", label: "聊天", glyph: "话" },
  { to: "/wallet", label: "积分", glyph: "卷" },
  { to: "/settings", label: "账户", glyph: "我" },
] as const;

const LEGAL_ITEMS = [
  { to: "/terms", label: "服务协议" },
  { to: "/privacy", label: "隐私政策" },
  { to: "/refunds", label: "退款说明" },
  { to: "/contact", label: "联系我们" },
] as const;

function MoonMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24.6 19.9A9.6 9.6 0 0 1 12.1 7.4a10.4 10.4 0 1 0 12.5 12.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M23.5 6.5v3M22 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function DemoBanner() {
  const presentation = usePresentationMode();
  if (presentation) {
    return null;
  }
  return (
    <div className="border-b border-moon-400/30 bg-moon-400/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] leading-5 text-moon-200">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-moon-400/40 px-2 py-0.5 text-[11px] font-medium tracking-wide text-moon-300">
          演示模式
        </span>
        <span>M1 云端基础 · 模型调用与真实支付未开放</span>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { state } = useAuth();
  const accountTo = state.status === "authenticated" ? "/settings" : "/login";
  const accountLabel = state.status === "authenticated" ? state.session.user.displayName : "登录";

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-night-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-moon-300">
          <MoonMark />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg tracking-[0.18em] text-paper-50">续月记</span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-mist-400">
              Xuyueji
            </span>
          </span>
        </Link>

        <nav aria-label="主导航" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "rounded-full px-4 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-paper-50/10 text-moon-300"
                    : "text-mist-200 hover:bg-paper-50/5 hover:text-paper-50",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to={accountTo}
          className="inline-flex min-h-10 max-w-[9rem] items-center truncate rounded-full border border-moon-400/50 px-4 py-2 text-sm font-medium text-moon-200 transition-colors hover:bg-moon-400/10"
        >
          {accountLabel}
        </Link>
      </div>
    </header>
  );
}

export function MobileNav() {
  return (
    <nav
      aria-label="移动端导航"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t hairline bg-night-950/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {MOBILE_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                isActive ? "text-moon-300" : "text-mist-300",
              ].join(" ")
            }
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-current/25 text-[12px]"
            >
              {item.glyph}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const presentation = usePresentationMode();
  return (
    <footer className="mt-20 border-t hairline bg-night-900/50 pb-20 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 text-moon-300">
            <MoonMark className="h-6 w-6" />
            <span className="font-display text-lg tracking-[0.16em] text-paper-50">续月记</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-7 text-mist-300">
            面向中国成年人的 AI 文本互动、长篇角色扮演与文学创作工具。云端存档、角色版本、
            剧情分支与数据导出已经可用；模型生成与支付服务以正式公告为准。
          </p>
          {presentation ? null : (
            <p className="mt-4 text-xs leading-6 text-mist-400">
              运营主体、ICP 备案号与 AI
              服务相关手续将在正式上线前于本页公示。本页不构成任何已获批声明。
            </p>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-mist-400">产品</h2>
          <ul className="mt-4 space-y-2 text-sm text-mist-200">
            <li>
              <Link className="hover:text-moon-300" to="/chat">
                聊天演示
              </Link>
            </li>
            <li>
              <Link className="hover:text-moon-300" to="/characters">
                云端角色
              </Link>
            </li>
            <li>
              <Link className="hover:text-moon-300" to="/wallet">
                积分与钱包
              </Link>
            </li>
            <li>
              <Link className="hover:text-moon-300" to="/help">
                帮助与状态
              </Link>
            </li>
            <li>
              <Link className="hover:text-moon-300" to="/settings">
                账号与导入导出
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-mist-400">
            协议与支持
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-mist-200">
            {LEGAL_ITEMS.map((item) => (
              <li key={item.to}>
                <Link className="hover:text-moon-300" to={item.to}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t hairline">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-mist-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 续月记 Xuyueji</span>
          <span>
            {presentation
              ? "支付服务暂未开放；积分与价格以正式公示为准。"
              : "本演示不调用模型、不开放真实收款；账号与故事数据仅用于受控演示。"}
          </span>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh night-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-paper-50 focus:px-4 focus:py-2 focus:text-night-900"
      >
        跳到正文
      </a>
      <DemoBanner />
      <SiteHeader />
      <main id="main" className="pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileNav />
    </div>
  );
}
