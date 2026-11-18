import type {
  LorebookDetailDto,
  LorebookEntryDto,
  LorebookEntryInput,
  LorebookSummaryDto,
} from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import { ApiError } from "../lib/http.js";
import {
  createLorebook,
  createLoreEntry,
  deleteLoreEntry,
  getLorebook,
  listLorebooks,
  updateLoreEntry,
} from "../lib/lorebooks-api.js";

interface EntryForm {
  entryKey: string;
  content: string;
  matchMode: "keyword" | "regex";
  regexPattern: string;
  regexFlags: string;
  keysText: string;
  secondaryKeysText: string;
  constant: boolean;
  probability: number;
  position: LorebookEntryDto["rule"]["position"];
  depth: number;
  scanDepth: number;
  recursive: boolean;
  enabled: boolean;
  sortKey: number;
}

const EMPTY_FORM: EntryForm = {
  entryKey: "",
  content: "",
  matchMode: "keyword",
  regexPattern: "",
  regexFlags: "",
  keysText: "",
  secondaryKeysText: "",
  constant: false,
  probability: 1,
  position: "after_char",
  depth: 4,
  scanDepth: 4,
  recursive: false,
  enabled: true,
  sortKey: 0,
};

const POSITIONS: Array<{ value: LorebookEntryDto["rule"]["position"]; label: string }> = [
  { value: "before_char", label: "角色前" },
  { value: "after_char", label: "角色后" },
  { value: "before_examples", label: "示例前" },
  { value: "after_examples", label: "示例后" },
  { value: "at_depth", label: "指定深度" },
];

function splitKeys(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function entryToForm(entry: LorebookEntryDto): EntryForm {
  return {
    entryKey: entry.entryKey,
    content: entry.content,
    matchMode: entry.rule.matchMode,
    regexPattern: entry.rule.regexPattern,
    regexFlags: entry.rule.regexFlags,
    keysText: entry.rule.keys.join(", "),
    secondaryKeysText: entry.rule.secondaryKeys.join(", "),
    constant: entry.rule.constant,
    probability: entry.rule.probability,
    position: entry.rule.position,
    depth: entry.rule.depth,
    scanDepth: entry.rule.scanDepth,
    recursive: entry.rule.recursive,
    enabled: entry.enabled,
    sortKey: entry.sortKey,
  };
}

function formToInput(form: EntryForm): LorebookEntryInput {
  return {
    ...(form.entryKey.trim() ? { entryKey: form.entryKey.trim() } : {}),
    content: form.content.trim(),
    matchMode: form.matchMode,
    regexPattern: form.regexPattern,
    regexFlags: form.regexFlags,
    keys: splitKeys(form.keysText),
    secondaryKeys: splitKeys(form.secondaryKeysText),
    caseSensitive: false,
    constant: form.constant,
    probability: Math.min(1, Math.max(0, Number.isFinite(form.probability) ? form.probability : 1)),
    position: form.position,
    depth: Math.max(0, Math.floor(form.depth)),
    scanDepth: Math.max(0, Math.floor(form.scanDepth)),
    recursive: form.recursive,
    enabled: form.enabled,
    sortKey: Math.max(0, Math.floor(form.sortKey)),
  };
}

export function LorebooksPage() {
  const { state } = useAuth();
  const [books, setBooks] = useState<LorebookSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LorebookDetailDto | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<LorebookEntryDto | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listLorebooks();
      setBooks(result.lorebooks);
      setSelectedId((current) => current ?? result.lorebooks[0]?.id ?? null);
      return result.lorebooks;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取世界书失败。");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (lorebookId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLorebook(lorebookId);
      setDetail(result);
      setSelectedId(lorebookId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取世界书详情失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }
    void loadBooks().then((list) => {
      const first = list[0];
      if (first) {
        void loadDetail(first.id);
      }
    });
  }, [state.status, loadBooks, loadDetail]);

  async function handleCreateBook(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const book = await createLorebook({ title: newTitle.trim() });
      setNewTitle("");
      await loadBooks();
      await loadDetail(book.id);
      setNotice("世界书已创建。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建世界书失败。");
    }
  }

  function startNewEntry() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setError(null);
    setNotice(null);
  }

  function startEditEntry(entry: LorebookEntryDto) {
    setEditing(entry);
    setForm(entryToForm(entry));
    setEditorOpen(true);
    setError(null);
    setNotice(null);
  }

  async function handleSaveEntry(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) {
      return;
    }
    if (!form.content.trim()) {
      setError("条目内容不能为空。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const input = formToInput(form);
    try {
      if (editing) {
        await updateLoreEntry(selectedId, editing.id, {
          ...input,
          expectedRevision: editing.revision,
        });
        setNotice(`条目已保存为版本 ${editing.revision + 1}。`);
      } else {
        await createLoreEntry(selectedId, input);
        setNotice("条目已创建。");
      }
      setEditorOpen(false);
      setEditing(null);
      await loadDetail(selectedId);
      await loadBooks();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已更新这个条目；已保留表单，请刷新后再合并。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存条目失败。");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!selectedId) {
      return;
    }
    if (deleteCandidate !== entryId) {
      setDeleteCandidate(entryId);
      return;
    }
    setDeleteCandidate(null);
    setError(null);
    try {
      await deleteLoreEntry(selectedId, entryId);
      await loadDetail(selectedId);
      await loadBooks();
      setNotice("条目已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除条目失败。");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="世界书 / Lorebooks"
        title="让设定在需要时出现。"
        description="世界书条目按关键词、概率、扫描深度与递归规则触发；Prompt 预览会展示命中来源与预算。"
        aside={<GateBadge gate="M2 编辑器" tone="ready" />}
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
            <h2 className="mt-3 font-display text-2xl text-night-900">世界书保存在云端</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              登录后可以创建世界书、编辑条目，并在 Prompt 预览中验证触发结果。
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
                <h2 className="font-display text-xl text-paper-50">新建世界书</h2>
                <form onSubmit={handleCreateBook} className="mt-3 flex gap-2">
                  <label htmlFor="lorebook-title" className="sr-only">
                    世界书标题
                  </label>
                  <input
                    id="lorebook-title"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="例如：雨夜书店"
                    className="min-h-10 min-w-0 flex-1 rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                  />
                  <button
                    type="submit"
                    className="min-h-10 shrink-0 rounded-full bg-moon-400 px-4 py-2 text-xs font-semibold text-night-950"
                  >
                    创建
                  </button>
                </form>
              </section>

              <section className="glass-card rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-paper-50">我的世界书</h2>
                  <span className="text-[11px] text-mist-400">{books.length} 本</span>
                </div>
                {loading && books.length === 0 ? (
                  <p className="mt-3 text-xs text-mist-400">读取中…</p>
                ) : books.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                    还没有世界书。
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {books.map((book) => (
                      <li key={book.id}>
                        <button
                          type="button"
                          onClick={() => void loadDetail(book.id)}
                          className={[
                            "w-full rounded-xl px-3 py-2 text-left",
                            book.id === selectedId
                              ? "bg-paper-50/10 text-moon-200"
                              : "text-mist-300 hover:bg-paper-50/5",
                          ].join(" ")}
                        >
                          <span className="block truncate text-sm">{book.title}</span>
                          <span className="mt-0.5 block text-[10px] text-mist-500">
                            {book.entryCount} 条目 · r{book.revision}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <DemoDataNote>
                关键词、概率、扫描深度与递归都会进入服务端 Prompt 预览；当前编辑的是真实云端数据。
              </DemoDataNote>
            </div>

            <section className="paper-card rounded-3xl p-6 sm:p-8">
              {detail ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Eyebrow>世界书</Eyebrow>
                      <h2 className="mt-2 font-display text-2xl text-night-900">
                        {detail.lorebook.title}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {detail.entries.length} 条目 · revision {detail.lorebook.revision}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startNewEntry}
                      className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50"
                    >
                      新建条目
                    </button>
                  </div>

                  <div className="mt-5 space-y-2">
                    {detail.entries.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
                        还没有条目。新建一条，让世界在关键词出现时说话。
                      </p>
                    ) : (
                      detail.entries.map((entry) => (
                        <article
                          key={entry.id}
                          className="rounded-2xl border border-slate-200 bg-white/60 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-night-900">{entry.entryKey}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-6 text-slate-600">
                                {entry.content}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {entry.rule.constant
                                  ? "常驻"
                                  : entry.rule.matchMode === "regex"
                                    ? `正则：${entry.rule.regexPattern || "无"}`
                                    : `关键词：${entry.rule.keys.join("、") || "无"}`}
                                {" · "}
                                {entry.rule.recursive ? "递归" : "不递归"}
                                {" · "}
                                概率 {entry.rule.probability}
                                {" · "}
                                扫描 {entry.rule.scanDepth}
                                {entry.rule.position === "at_depth"
                                  ? ` · 插入深度 ${entry.rule.depth}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => startEditEntry(entry)}
                                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] text-night-900"
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteEntry(entry.id)}
                                className={[
                                  "rounded-full px-3 py-1 text-[11px]",
                                  deleteCandidate === entry.id
                                    ? "bg-rose-600 text-white"
                                    : "border border-rose-300 text-rose-800",
                                ].join(" ")}
                              >
                                {deleteCandidate === entry.id ? "确认删除" : "删除"}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  {editorOpen ? (
                    <form
                      onSubmit={handleSaveEntry}
                      className="mt-6 rounded-2xl border border-slate-300 bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-night-900">
                          {editing ? `编辑条目 ${editing.entryKey}` : "新建条目"}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setEditorOpen(false)}
                          className="text-xs text-slate-500 underline underline-offset-4"
                        >
                          取消
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="lore-content" className="text-xs text-slate-500">
                            内容
                          </label>
                          <textarea
                            id="lore-content"
                            value={form.content}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, content: event.target.value }))
                            }
                            rows={4}
                            required
                            className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 text-night-900"
                          />
                        </div>
                        <div>
                          <label htmlFor="lore-match-mode" className="text-xs text-slate-500">
                            触发方式
                          </label>
                          <select
                            id="lore-match-mode"
                            value={form.matchMode}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                matchMode: event.target.value as "keyword" | "regex",
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          >
                            <option value="keyword">关键词</option>
                            <option value="regex">正则（安全子集）</option>
                          </select>
                        </div>
                        {form.matchMode === "regex" ? (
                          <div>
                            <label htmlFor="lore-regex" className="text-xs text-slate-500">
                              正则表达式与标志
                            </label>
                            <div className="mt-1 flex gap-2">
                              <input
                                id="lore-regex"
                                value={form.regexPattern}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    regexPattern: event.target.value,
                                  }))
                                }
                                spellCheck={false}
                                placeholder="雨夜|铜灯"
                                className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-night-900"
                              />
                              <input
                                id="lore-regex-flags"
                                aria-label="正则标志"
                                value={form.regexFlags}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    regexFlags: event.target.value,
                                  }))
                                }
                                maxLength={10}
                                spellCheck={false}
                                placeholder="ims"
                                className="w-20 rounded-xl border border-slate-300 px-2 py-2 font-mono text-sm text-night-900"
                              />
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <label htmlFor="lore-keys" className="text-xs text-slate-500">
                            主关键词（逗号分隔）
                          </label>
                          <input
                            id="lore-keys"
                            value={form.keysText}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, keysText: event.target.value }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                        <div>
                          <label htmlFor="lore-secondary" className="text-xs text-slate-500">
                            次关键词（可选）
                          </label>
                          <input
                            id="lore-secondary"
                            value={form.secondaryKeysText}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secondaryKeysText: event.target.value,
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                        <div>
                          <label htmlFor="lore-entry-key" className="text-xs text-slate-500">
                            条目 key（可选）
                          </label>
                          <input
                            id="lore-entry-key"
                            value={form.entryKey}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, entryKey: event.target.value }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                        <div>
                          <label htmlFor="lore-position" className="text-xs text-slate-500">
                            位置
                          </label>
                          <select
                            id="lore-position"
                            value={form.position}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                position: event.target.value as EntryForm["position"],
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          >
                            {POSITIONS.map((position) => (
                              <option key={position.value} value={position.value}>
                                {position.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="lore-probability" className="text-xs text-slate-500">
                            概率
                          </label>
                          <input
                            id="lore-probability"
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={form.probability}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                probability: Number(event.target.value),
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                        <div>
                          <label htmlFor="lore-scan-depth" className="text-xs text-slate-500">
                            扫描深度
                          </label>
                          <input
                            id="lore-scan-depth"
                            type="number"
                            min={0}
                            max={50}
                            value={form.scanDepth}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                scanDepth: Number(event.target.value),
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                        {form.position === "at_depth" ? (
                          <div>
                            <label htmlFor="lore-depth" className="text-xs text-slate-500">
                              插入深度（从对话末尾数）
                            </label>
                            <input
                              id="lore-depth"
                              type="number"
                              min={0}
                              max={50}
                              value={form.depth}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  depth: Number(event.target.value),
                                }))
                              }
                              className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                            />
                          </div>
                        ) : null}
                        <div>
                          <label htmlFor="lore-sort-key" className="text-xs text-slate-500">
                            排序
                          </label>
                          <input
                            id="lore-sort-key"
                            type="number"
                            min={0}
                            value={form.sortKey}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                sortKey: Number(event.target.value),
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.constant}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                constant: event.target.checked,
                              }))
                            }
                          />
                          常驻
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.recursive}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                recursive: event.target.checked,
                              }))
                            }
                          />
                          递归
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.enabled}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                enabled: event.target.checked,
                              }))
                            }
                          />
                          启用
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={saving}
                        className="mt-4 inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 disabled:opacity-60"
                      >
                        {saving ? "保存中…" : "保存条目"}
                      </button>
                    </form>
                  ) : null}

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
                </>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Eyebrow>选择世界书</Eyebrow>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                    从左侧选择一本世界书，或先创建一本。条目会参与关键词触发、概率与递归预算。
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
