import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import { exportAccountData, type ImportResult, importAccountData } from "../lib/account-api.js";
import { pendingOutboxCount } from "../lib/outbox.js";
import { type FlushOutboxResult, flushOutbox } from "../lib/outbox-sync.js";

export function SettingsPage() {
  const { state, signOut, signOutAll } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [outboxCount, setOutboxCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<FlushOutboxResult | null>(null);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }
    pendingOutboxCount()
      .then(setOutboxCount)
      .catch(() => setOutboxCount(null));
  }, [state.status]);

  async function syncOutbox() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const result = await flushOutbox();
      setSyncResult(result);
      setOutboxCount(result.pending);
      if (result.error) {
        setError(`同步失败：${result.error}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败。");
    } finally {
      setSyncing(false);
    }
  }

  async function downloadExport() {
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const blob = await exportAccountData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `xuyueji-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("导出已开始下载。文件包含故事数据，不包含密码、会话或支付凭据。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败。");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) {
      return;
    }
    setBusy("import");
    setError(null);
    setMessage(null);
    setImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = await importAccountData(parsed);
      setImportResult(result);
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? "导入文件不是有效的 JSON。"
          : cause instanceof Error
            ? cause.message
            : "导入失败。",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="设置 / Settings"
        title="账号、导出与本地同步队列。"
        description="M1 把云端权威存档与浏览器缓存分开：服务端 PostgreSQL 保存角色、会话与消息图；IndexedDB 只保留草稿和待同步操作。"
        aside={<GateBadge gate="M1 云端基础" tone="ready" />}
      />

      <div className="px-4 py-8 sm:px-6">
        {state.status === "loading" ? (
          <p className="glass-card rounded-2xl p-6 text-sm text-mist-300">正在读取账号状态…</p>
        ) : null}

        {state.status === "unavailable" ? (
          <div className="glass-card rounded-2xl p-6">
            <p className="text-sm text-rose-100">云端账号服务未连接：{state.message}</p>
            <p className="mt-2 text-xs leading-6 text-mist-400">
              本地页面与聊天演示仍可使用。启动 API 并配置 DATABASE_URL 后再访问本页。
            </p>
          </div>
        ) : null}

        {state.status === "anonymous" ? (
          <div className="paper-card rounded-3xl p-6 sm:p-8">
            <Eyebrow>尚未登录</Eyebrow>
            <h2 className="mt-3 font-display text-2xl text-night-900">云端存档需要账号</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              未登录时只能使用本地聊天演示与浏览器草稿，不会写入 PostgreSQL。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center rounded-full bg-night-900 px-5 py-2.5 text-sm font-medium text-paper-50"
              >
                登录
              </Link>
              {state.config.signupEnabled ? (
                <Link
                  to="/register"
                  className="inline-flex min-h-11 items-center rounded-full border border-night-900/20 px-5 py-2.5 text-sm font-medium text-night-900"
                >
                  注册
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {state.status === "authenticated" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <section className="paper-card rounded-3xl p-6 sm:p-8">
              <Eyebrow>账号</Eyebrow>
              <h2 className="mt-2 font-display text-2xl text-night-900">
                {state.session.user.displayName}
              </h2>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>邮箱</dt>
                  <dd className="text-night-900">{state.session.user.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>创建时间</dt>
                  <dd>{new Date(state.session.user.createdAt).toLocaleString("zh-CN")}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>当前会话到期</dt>
                  <dd>{new Date(state.session.expiresAt).toLocaleString("zh-CN")}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>注册状态</dt>
                  <dd>{state.config.signupEnabled ? "演示环境已开启" : "由运营者控制"}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/characters"
                  className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50"
                >
                  管理云端角色
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex min-h-10 items-center rounded-full border border-night-900/20 px-4 py-2 text-xs font-medium text-night-900"
                >
                  退出登录
                </button>
                <button
                  type="button"
                  onClick={() => void signOutAll()}
                  className="inline-flex min-h-10 items-center rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-900"
                >
                  退出所有设备
                </button>
              </div>
            </section>

            <section className="glass-card rounded-3xl p-6 sm:p-8">
              <Eyebrow>导出 / 导入</Eyebrow>
              <h2 className="mt-2 font-display text-2xl text-paper-50">把数据带走</h2>
              <p className="mt-2 text-sm leading-7 text-mist-300">
                JSON 导出包含角色、版本、会话、分支与消息图。导入会在当前账号下创建新 ID，
                不覆盖已有数据；人格、世界书、预设、正则与记忆的可导入格式仍在后续 Gate。
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void downloadExport()}
                  disabled={busy === "export"}
                  className="inline-flex min-h-11 items-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950 hover:bg-moon-300 disabled:opacity-60"
                >
                  {busy === "export" ? "正在导出…" : "导出 JSON"}
                </button>
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-moon-400/40 px-5 py-2.5 text-sm text-moon-200 hover:bg-moon-400/10">
                  {busy === "import" ? "正在导入…" : "导入 JSON"}
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={(event) => void handleImport(event.target.files?.[0])}
                    disabled={busy === "import"}
                  />
                </label>
              </div>

              {message ? (
                <p className="mt-4 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs leading-6 text-emerald-100">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-rose-400/10 px-3 py-2 text-xs text-rose-100"
                >
                  {error}
                </p>
              ) : null}
              {importResult ? (
                <p className="mt-4 rounded-xl bg-paper-50/5 px-3 py-2 text-xs leading-6 text-mist-200">
                  已导入：角色 {importResult.imported.characters}、会话{" "}
                  {importResult.imported.conversations}、消息 {importResult.imported.messages}。
                  {importResult.imported.skipped > 0
                    ? ` 跳过 ${importResult.imported.skipped} 个尚未支持导入的条目。`
                    : ""}
                </p>
              ) : null}

              <div className="mt-5">
                <DemoDataNote>
                  导出文件不包含密码、会话令牌、API Key 或支付凭据；钱包与订单账单另行提供。
                </DemoDataNote>
              </div>
            </section>

            <section className="glass-card rounded-3xl p-6 sm:p-8 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Eyebrow>本地同步队列</Eyebrow>
                  <h2 className="mt-2 font-display text-2xl text-paper-50">
                    待同步操作：{outboxCount ?? "—"}
                  </h2>
                </div>
                <GateBadge gate="Dexie outbox" tone="ready" />
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-mist-300">
                outbox 保存离线修改的 intent，以 opId 幂等；失败 5 次后进入 failed，不会无限重试。
                服务端 `/api/mutations` 已支持 persona、lorebook、preset、regex 与 memory 的 CAS
                写入；角色与会话走各自的专用路由。
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void syncOutbox()}
                  disabled={syncing || outboxCount === 0}
                  className="inline-flex min-h-10 items-center rounded-full bg-moon-400 px-4 py-2 text-xs font-semibold text-night-950 hover:bg-moon-300 disabled:cursor-not-allowed disabled:bg-paper-50/10 disabled:text-mist-400"
                >
                  {syncing ? "正在同步…" : "同步本地队列"}
                </button>
                <span className="text-[11px] text-mist-400">
                  当前为手动触发；自动后台投递在后续切片接入。
                </span>
              </div>

              {syncResult ? (
                <p className="mt-3 rounded-xl bg-paper-50/5 px-3 py-2 text-xs leading-6 text-mist-200">
                  已接受 {syncResult.accepted} · 冲突 {syncResult.conflicts} · 失败{" "}
                  {syncResult.failed} · 仍待同步 {syncResult.pending}
                  {syncResult.error ? ` · ${syncResult.error}` : ""}
                </p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
