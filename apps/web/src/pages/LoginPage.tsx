import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { Eyebrow, GateBadge } from "../components/Primitives.js";

export function LoginPage() {
  const { state, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") {
    return <Navigate to="/settings" replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <Eyebrow>账号 / Sign in</Eyebrow>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-paper-50">登录云端存档</h1>
        <GateBadge gate="M1" tone="ready" />
      </div>
      <p className="mt-2 text-sm leading-7 text-mist-300">
        登录后角色、会话与消息图保存到 PostgreSQL；浏览器只保留草稿与同步队列。
        模型调用与支付仍未启用。
      </p>

      {state.status === "unavailable" ? (
        <p className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          云端账号服务未连接：{state.message}
        </p>
      ) : null}

      <form onSubmit={submit} className="glass-card mt-6 space-y-4 rounded-3xl p-6">
        <div>
          <label htmlFor="login-email" className="text-xs text-mist-300">
            邮箱
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="text-xs text-mist-300">
            密码
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || state.status === "loading"}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950 hover:bg-moon-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "正在登录…" : "登录"}
        </button>

        <p className="text-center text-xs text-mist-400">
          {state.status === "anonymous" && state.config.signupEnabled ? (
            <Link className="text-moon-300 underline underline-offset-4" to="/register">
              没有账号？注册
            </Link>
          ) : (
            "公开注册由运营者控制；未开放时请使用已创建的账号。"
          )}
        </p>
      </form>

      <p className="mt-5 text-center text-xs leading-6 text-mist-400">
        当前为演示环境。不要在这里输入真实支付凭据或敏感个人信息。
      </p>
    </div>
  );
}
