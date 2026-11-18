import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { Eyebrow, GateBadge } from "../components/Primitives.js";

export function RegisterPage() {
  const { state, signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "authenticated") {
    return <Navigate to="/settings" replace />;
  }

  if (state.status === "anonymous" && !state.config.signupEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Eyebrow>注册 / Sign up</Eyebrow>
        <h1 className="mt-3 font-display text-3xl text-paper-50">公开注册未开放</h1>
        <p className="mt-3 text-sm leading-7 text-mist-300">
          当前部署没有开启 `PUBLIC_SIGNUP_ENABLED`。在备案、年龄保护与运营流程完成前，
          账号由运营者创建。你仍然可以使用已有账号登录。
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950"
        >
          去登录
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ageConfirmed) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp({ email, password, displayName, ageConfirmed: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <Eyebrow>注册 / Sign up</Eyebrow>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-paper-50">创建演示账号</h1>
        <GateBadge gate="M1" tone="ready" />
      </div>
      <p className="mt-2 text-sm leading-7 text-mist-300">
        密码至少 12 位。账号仅用于本地/受控演示，不代表公开运营或收费服务已开放。
      </p>

      <form onSubmit={submit} className="glass-card mt-6 space-y-4 rounded-3xl p-6">
        <div>
          <label htmlFor="register-name" className="text-xs text-mist-300">
            显示名称
          </label>
          <input
            id="register-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={80}
            className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
          />
        </div>
        <div>
          <label htmlFor="register-email" className="text-xs text-mist-300">
            邮箱
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
          />
        </div>
        <div>
          <label htmlFor="register-password" className="text-xs text-mist-300">
            密码（至少 12 位）
          </label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
          />
        </div>
        <label className="flex items-start gap-2 text-xs leading-6 text-mist-300">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(event) => setAgeConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border hairline bg-night-950"
          />
          我确认已年满 18 周岁，并理解当前是演示环境。
        </label>

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !ageConfirmed}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950 hover:bg-moon-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "正在创建…" : "创建账号"}
        </button>

        <p className="text-center text-xs text-mist-400">
          已有账号？
          <Link className="ml-1 text-moon-300 underline underline-offset-4" to="/login">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
