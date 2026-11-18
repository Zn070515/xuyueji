import type { ConversationSummaryDto, MemoryItemDto, MemoryKindDto } from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import { listConversations } from "../lib/conversations-api.js";
import { ApiError } from "../lib/http.js";
import { createMemory, deleteMemory, listMemories, updateMemory } from "../lib/memories-api.js";

const KIND_LABELS: Record<MemoryKindDto, string> = {
  manual_fact: "手动事实",
  event: "事件",
  summary: "摘要",
  relationship: "关系",
  retrieval_hit: "检索命中",
};

interface Draft {
  kind: MemoryKindDto;
  content: string;
  conversationId: string;
  scope: "conversation" | "global";
  locked: boolean;
}

const EMPTY_DRAFT: Draft = {
  kind: "manual_fact",
  content: "",
  conversationId: "",
  scope: "conversation",
  locked: false,
};

export function MemoriesPage() {
  const { state } = useAuth();
  const [memories, setMemories] = useState<MemoryItemDto[]>([]);
  const [conversations, setConversations] = useState<ConversationSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [revision, setRevision] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listMemories();
    setMemories(result.memories);
    return result.memories;
  }, []);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }
    let active = true;
    load()
      .then((list) => {
        if (!active) {
          return;
        }
        const first = list[0];
        if (first) {
          setSelectedId(first.id);
          setRevision(first.revision);
          setDraft({
            kind: first.kind,
            content: first.content,
            conversationId: first.conversationId ?? "",
            scope: first.scope,
            locked: first.locked,
          });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "读取记忆失败。");
        }
      });
    listConversations()
      .then((result) => {
        if (active) {
          setConversations(result.conversations);
        }
      })
      .catch(() => {
        // Memory editing works without a conversation binding.
      });
    return () => {
      active = false;
    };
  }, [state.status, load]);

  function selectMemory(memory: MemoryItemDto) {
    setSelectedId(memory.id);
    setRevision(memory.revision);
    setDraft({
      kind: memory.kind,
      content: memory.content,
      conversationId: memory.conversationId ?? "",
      scope: memory.scope,
      locked: memory.locked,
    });
    setCreating(false);
    setDeleteCandidate(null);
    setError(null);
    setNotice(null);
  }

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setRevision(null);
    setDraft(EMPTY_DRAFT);
    setDeleteCandidate(null);
    setError(null);
    setNotice(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!draft.content.trim()) {
      setError("记忆内容不能为空。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload = {
      kind: draft.kind,
      content: draft.content.trim(),
      ...(draft.conversationId ? { conversationId: draft.conversationId } : {}),
      scope: draft.scope,
      locked: draft.locked,
    };
    try {
      if (creating || !selectedId || revision === null) {
        const created = await createMemory(payload);
        setCreating(false);
        setSelectedId(created.id);
        setRevision(created.revision);
        setDraft({
          kind: created.kind,
          content: created.content,
          conversationId: created.conversationId ?? "",
          scope: created.scope,
          locked: created.locked,
        });
        setNotice("记忆已创建。");
      } else {
        const updated = await updateMemory(selectedId, {
          ...payload,
          expectedRevision: revision,
        });
        setRevision(updated.revision);
        setDraft({
          kind: updated.kind,
          content: updated.content,
          conversationId: updated.conversationId ?? "",
          scope: updated.scope,
          locked: updated.locked,
        });
        setNotice(`记忆已保存为版本 ${updated.revision}。`);
      }
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已更新这条记忆；本地编辑保留，请刷新后再合并。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存记忆失败。");
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
      await deleteMemory(selectedId);
      const list = await load();
      const first = list[0];
      if (first) {
        selectMemory(first);
      } else {
        startCreate();
      }
      setNotice("记忆已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除记忆失败。");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="记忆 / Memory"
        title="让角色记住真正重要的事。"
        description="手动事实、事件与摘要保存在云端；Prompt 预览会按当前输入做确定性检索，选中项以 memory 组件注入，并显示命中词与得分。"
        aside={<GateBadge gate="M2 Memory" tone="ready" />}
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
            <h2 className="mt-3 font-display text-2xl text-night-900">记忆保存在云端</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              登录后可以创建、锁定并在 Prompt 预览中检索长期记忆。
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
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4">
              <section className="glass-card rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-paper-50">我的记忆</h2>
                  <span className="text-[11px] text-mist-400">{memories.length} 条</span>
                </div>
                {memories.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                    还没有记忆条目。
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {memories.map((memory) => (
                      <li key={memory.id}>
                        <button
                          type="button"
                          onClick={() => selectMemory(memory)}
                          className={[
                            "w-full rounded-xl px-3 py-2 text-left",
                            memory.id === selectedId
                              ? "bg-paper-50/10 text-moon-200"
                              : "text-mist-300 hover:bg-paper-50/5",
                          ].join(" ")}
                        >
                          <span className="block truncate text-sm">
                            {memory.locked ? "🔒 " : ""}
                            {memory.content}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-mist-500">
                            {KIND_LABELS[memory.kind]} ·{" "}
                            {memory.scope === "global" ? "全局" : "会话"} · r{memory.revision}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={startCreate}
                  className="mt-3 w-full rounded-full border border-moon-400/40 px-3 py-1.5 text-[11px] text-moon-200 hover:bg-moon-400/10"
                >
                  新建记忆
                </button>
              </section>

              <DemoDataNote>
                检索是确定性的词面打分，不是向量检索；同一输入与同一批记忆总会得到同一结果。
              </DemoDataNote>
            </div>

            <section className="paper-card rounded-3xl p-6 sm:p-8">
              <form onSubmit={handleSave}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Eyebrow>{creating ? "新建记忆" : "编辑记忆"}</Eyebrow>
                    {revision !== null ? (
                      <p className="mt-1 text-xs text-slate-500">revision {revision}</p>
                    ) : null}
                  </div>
                  {!creating && selectedId ? (
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
                      {deleteCandidate === selectedId ? "确认删除记忆" : "删除记忆"}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-slate-600">
                    类型
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        setDraft({ ...draft, kind: event.target.value as MemoryKindDto })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                    >
                      {Object.entries(KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-slate-600">
                    作用范围
                    <select
                      value={draft.scope}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          scope: event.target.value === "global" ? "global" : "conversation",
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                    >
                      <option value="conversation">仅当前会话</option>
                      <option value="global">全局背景</option>
                    </select>
                  </label>
                </div>

                <label htmlFor="memory-content" className="mt-3 block text-xs text-slate-600">
                  内容
                </label>
                <textarea
                  id="memory-content"
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  rows={5}
                  maxLength={100_000}
                  className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 text-night-900"
                />

                <label htmlFor="memory-conversation" className="mt-3 block text-xs text-slate-600">
                  绑定会话（可选）
                </label>
                <select
                  id="memory-conversation"
                  value={draft.conversationId}
                  onChange={(event) => setDraft({ ...draft, conversationId: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                >
                  <option value="">不绑定具体会话</option>
                  {conversations.map((conversation) => (
                    <option key={conversation.id} value={conversation.id}>
                      {conversation.title}
                    </option>
                  ))}
                </select>

                <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.locked}
                    onChange={(event) => setDraft({ ...draft, locked: event.target.checked })}
                  />
                  锁定（总是注入，优先于普通检索）
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 disabled:opacity-60"
                  >
                    {saving ? "保存中…" : "保存记忆"}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    保存会生成新 revision；过期设备会得到 409。
                  </span>
                </div>

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
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
