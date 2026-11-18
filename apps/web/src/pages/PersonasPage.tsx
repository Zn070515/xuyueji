import type { PersonaDetailDto, PersonaSummaryDto } from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import { ApiError } from "../lib/http.js";
import {
  addPersonaVersion,
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
} from "../lib/personas-api.js";

export function PersonasPage() {
  const { state } = useAuth();
  const [personas, setPersonas] = useState<PersonaSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonaDetailDto | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const result = await listPersonas();
    setPersonas(result.personas);
    return result.personas;
  }, []);

  const loadDetail = useCallback(async (personaId: string) => {
    const next = await getPersona(personaId);
    setDetail(next);
    setSelectedId(personaId);
    setEditName(next.activeVersion?.payload.displayName ?? next.persona.displayName);
    setEditDescription(next.activeVersion?.payload.description ?? "");
  }, []);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }
    let active = true;
    loadList()
      .then((list) => {
        const first = list[0];
        if (active && first) {
          void loadDetail(first.id);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "读取 Persona 失败。");
        }
      });
    return () => {
      active = false;
    };
  }, [state.status, loadList, loadDetail]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createPersona({
        displayName: newName.trim(),
        description: newDescription.trim(),
      });
      setNewName("");
      setNewDescription("");
      await loadList();
      setDetail(created);
      setSelectedId(created.persona.id);
      setEditName(created.activeVersion?.payload.displayName ?? created.persona.displayName);
      setEditDescription(created.activeVersion?.payload.description ?? "");
      setNotice("Persona 已创建。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建 Persona 失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!detail?.activeVersion || !selectedId) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await addPersonaVersion(selectedId, {
        expectedActiveVersionId: detail.activeVersion.id,
        payload: {
          displayName: editName.trim() || detail.persona.displayName,
          description: editDescription.trim(),
        },
      });
      setNotice(`已保存为版本 ${response.revision}。`);
      await loadDetail(selectedId);
      await loadList();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已更新这个 Persona；请刷新后再保存。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存 Persona 失败。");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      return;
    }
    if (deleteCandidate !== selectedId) {
      setDeleteCandidate(selectedId);
      return;
    }
    setDeleteCandidate(null);
    setError(null);
    try {
      await deletePersona(selectedId);
      setDetail(null);
      setSelectedId(null);
      const list = await loadList();
      const first = list[0];
      if (first) {
        await loadDetail(first.id);
      }
      setNotice("Persona 已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除 Persona 失败。");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Persona / 你的身份"
        title="让角色知道你正在扮演谁。"
        description="Persona 描述用户在故事中的身份、语气与背景；它会作为独立组件进入 Prompt，不会覆盖角色卡或世界书。"
        aside={<GateBadge gate="M2 Persona" tone="ready" />}
      />

      <div className="px-4 py-8 sm:px-6">
        {state.status === "loading" ? (
          <p className="glass-card rounded-2xl p-6 text-sm text-mist-300">正在读取账号状态…</p>
        ) : null}
        {state.status === "unavailable" ? (
          <p className="glass-card rounded-2xl p-6 text-sm text-rose-100">
            云端服务未连接：{state.message}
          </p>
        ) : null}
        {state.status === "anonymous" ? (
          <div className="paper-card rounded-3xl p-6 sm:p-8">
            <Eyebrow>需要登录</Eyebrow>
            <h2 className="mt-3 font-display text-2xl text-night-900">Persona 保存在云端</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              登录后可以创建多个 Persona，并在云端聊天的 Prompt 预览中选择。
            </p>
            <Link
              to="/login"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-night-900 px-5 py-2.5 text-sm font-medium text-paper-50"
            >
              去登录
            </Link>
          </div>
        ) : null}

        {state.status === "authenticated" ? (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <div className="space-y-4">
              <section className="glass-card rounded-3xl p-5">
                <h2 className="font-display text-xl text-paper-50">新建 Persona</h2>
                <form onSubmit={handleCreate} className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="persona-name" className="text-xs text-mist-300">
                      显示名称
                    </label>
                    <input
                      id="persona-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      required
                      maxLength={120}
                      className="mt-1 min-h-10 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="persona-description" className="text-xs text-mist-300">
                      身份设定
                    </label>
                    <textarea
                      id="persona-description"
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-moon-400 px-4 py-2 text-xs font-semibold text-night-950 disabled:opacity-60"
                  >
                    {saving ? "写入中…" : "创建 Persona"}
                  </button>
                </form>
              </section>

              <section className="glass-card rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-paper-50">我的 Persona</h2>
                  <span className="text-[11px] text-mist-400">{personas.length} 个</span>
                </div>
                {personas.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                    还没有 Persona。
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {personas.map((persona) => (
                      <li key={persona.id}>
                        <button
                          type="button"
                          onClick={() => void loadDetail(persona.id)}
                          className={[
                            "w-full rounded-xl px-3 py-2 text-left",
                            persona.id === selectedId
                              ? "bg-paper-50/10 text-moon-200"
                              : "text-mist-300 hover:bg-paper-50/5",
                          ].join(" ")}
                        >
                          <span className="block truncate text-sm">{persona.displayName}</span>
                          <span className="mt-0.5 block text-[10px] text-mist-500">
                            v{persona.revision} ·{" "}
                            {new Date(persona.updatedAt).toLocaleString("zh-CN")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <DemoDataNote>Persona 只描述用户侧身份；角色卡与平台策略不会被它覆盖。</DemoDataNote>
            </div>

            <section className="paper-card rounded-3xl p-6 sm:p-8">
              {detail ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Eyebrow>当前 Persona</Eyebrow>
                      <h2 className="mt-2 font-display text-2xl text-night-900">
                        {detail.persona.displayName}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        v{detail.persona.revision} · 共 {detail.versions.length} 个版本
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className={[
                        "inline-flex min-h-10 items-center rounded-full px-4 py-2 text-xs",
                        deleteCandidate === selectedId
                          ? "bg-rose-600 text-white"
                          : "border border-rose-300 text-rose-800",
                      ].join(" ")}
                    >
                      {deleteCandidate === selectedId ? "确认删除 Persona" : "删除"}
                    </button>
                  </div>

                  <form onSubmit={handleSave} className="mt-5 space-y-3">
                    <div>
                      <label htmlFor="persona-edit-name" className="text-xs text-slate-500">
                        显示名称
                      </label>
                      <input
                        id="persona-edit-name"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        maxLength={120}
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-night-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="persona-edit-description" className="text-xs text-slate-500">
                        身份设定
                      </label>
                      <textarea
                        id="persona-edit-description"
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        rows={8}
                        className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-7 text-night-900"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 disabled:opacity-60"
                    >
                      {saving ? "保存中…" : "保存为新版本"}
                    </button>
                  </form>

                  {notice ? (
                    <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      {notice}
                    </p>
                  ) : null}
                  {error ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900"
                    >
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      版本链
                    </h3>
                    <ul className="mt-3 divide-y divide-slate-200">
                      {detail.versions.map((version) => (
                        <li
                          key={version.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="text-xs text-slate-600">v{version.revision}</span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(version.createdAt).toLocaleString("zh-CN")}
                            {version.id === detail.persona.activeVersionId ? " · active" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Eyebrow>选择 Persona</Eyebrow>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                    从左侧选择或创建一个 Persona。它会作为独立组件进入 Prompt 预览。
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
