import type { PresetDetailDto, PresetSectionDto, PresetSummaryDto } from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import { RegexRulesPanel } from "../components/RegexRulesPanel.js";
import { ApiError } from "../lib/http.js";
import {
  createPreset,
  deletePreset,
  getPreset,
  listPresets,
  updatePreset,
} from "../lib/presets-api.js";

export function PresetsPage() {
  const { state } = useAuth();
  const [presets, setPresets] = useState<PresetSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PresetDetailDto | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [title, setTitle] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sections, setSections] = useState<PresetSectionDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  const applyDetail = useCallback((next: PresetDetailDto) => {
    setDetail(next);
    setSelectedId(next.preset.id);
    setTitle(next.preset.title);
    setEnabled(next.preset.enabled);
    setSections([...next.sections]);
  }, []);

  const loadList = useCallback(async () => {
    const result = await listPresets();
    setPresets(result.presets);
    return result.presets;
  }, []);

  const loadDetail = useCallback(
    async (presetId: string) => {
      applyDetail(await getPreset(presetId));
    },
    [applyDetail],
  );

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
          setError(cause instanceof Error ? cause.message : "读取预设失败。");
        }
      });
    return () => {
      active = false;
    };
  }, [state.status, loadList, loadDetail]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createPreset({ title: newTitle.trim(), sections: [] });
      setNewTitle("");
      applyDetail(created);
      await loadList();
      setNotice("预设已创建。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建预设失败。");
    } finally {
      setSaving(false);
    }
  }

  function addSection() {
    setSections((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: `段落 ${current.length + 1}`,
        content: "",
        enabled: true,
        order: current.length + 1,
        depth: 0,
      },
    ]);
  }

  function updateSection(index: number, patch: Partial<PresetSectionDto>) {
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    );
  }

  function removeSection(index: number) {
    setSections((current) => current.filter((_section, sectionIndex) => sectionIndex !== index));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!detail || !selectedId) {
      return;
    }
    if (!title.trim()) {
      setError("预设标题不能为空。");
      return;
    }
    if (sections.some((section) => !section.title.trim() || !section.content.trim())) {
      setError("每个段落都需要标题和内容。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updatePreset(selectedId, {
        title: title.trim(),
        sections,
        enabled,
        expectedRevision: detail.preset.revision,
      });
      applyDetail(updated);
      await loadList();
      setNotice(`预设已保存为版本 ${updated.preset.revision}。`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已更新这个预设；本地编辑保留，请刷新后再合并。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存预设失败。");
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
      await deletePreset(selectedId);
      setDetail(null);
      setSelectedId(null);
      const list = await loadList();
      const first = list[0];
      if (first) {
        await loadDetail(first.id);
      }
      setNotice("预设已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除预设失败。");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="预设 / Presets"
        title="把系统提示编排成可复用的预设。"
        description="预设由有序段落组成，可整体启停或在 Prompt 预览中选择；段落顺序会进入 Prompt 编译器的 preset_system 组件。"
        aside={<GateBadge gate="M2 Preset" tone="ready" />}
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
            <h2 className="mt-3 font-display text-2xl text-night-900">预设保存在云端</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              登录后可以创建、排序并在 Prompt 预览中选择预设。
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
              <section className="glass-card rounded-3xl p-5">
                <h2 className="font-display text-xl text-paper-50">新建预设</h2>
                <form onSubmit={handleCreate} className="mt-3 flex gap-2">
                  <label htmlFor="preset-title" className="sr-only">
                    预设标题
                  </label>
                  <input
                    id="preset-title"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="例如：简洁叙事"
                    className="min-h-10 min-w-0 flex-1 rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-10 shrink-0 rounded-full bg-moon-400 px-4 py-2 text-xs font-semibold text-night-950 disabled:opacity-60"
                  >
                    创建
                  </button>
                </form>
              </section>

              <section className="glass-card rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-paper-50">我的预设</h2>
                  <span className="text-[11px] text-mist-400">{presets.length} 个</span>
                </div>
                {presets.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                    还没有预设。
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {presets.map((preset) => (
                      <li key={preset.id}>
                        <button
                          type="button"
                          onClick={() => void loadDetail(preset.id)}
                          className={[
                            "w-full rounded-xl px-3 py-2 text-left",
                            preset.id === selectedId
                              ? "bg-paper-50/10 text-moon-200"
                              : "text-mist-300 hover:bg-paper-50/5",
                          ].join(" ")}
                        >
                          <span className="block truncate text-sm">{preset.title}</span>
                          <span className="mt-0.5 block text-[10px] text-mist-500">
                            {preset.sectionCount} 段 · r{preset.revision} ·{" "}
                            {preset.enabled ? "启用" : "停用"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <DemoDataNote>
                预设只拼接可编辑的系统段；平台强制策略始终由服务端固定，不能被预设替换。
              </DemoDataNote>
            </div>

            <section className="paper-card rounded-3xl p-6 sm:p-8">
              {detail ? (
                <form onSubmit={handleSave}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Eyebrow>预设编辑器</Eyebrow>
                      <label htmlFor="preset-edit-title" className="sr-only">
                        预设标题
                      </label>
                      <input
                        id="preset-edit-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={120}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-display text-2xl text-night-900"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        revision {detail.preset.revision} · {sections.length} 段
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
                      {deleteCandidate === selectedId ? "确认删除预设" : "删除预设"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                      />
                      整体启用
                    </label>
                    <button
                      type="button"
                      onClick={addSection}
                      className="rounded-full border border-night-900/20 px-3 py-1.5 text-[11px] text-night-900"
                    >
                      添加段落
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {sections.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
                        还没有段落。添加一段可编辑的系统提示。
                      </p>
                    ) : (
                      sections.map((section, index) => (
                        <article
                          key={section.id}
                          className="rounded-2xl border border-slate-200 bg-white/70 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor={`section-title-${section.id}`} className="sr-only">
                              段落标题
                            </label>
                            <input
                              id={`section-title-${section.id}`}
                              value={section.title}
                              onChange={(event) =>
                                updateSection(index, { title: event.target.value })
                              }
                              className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium text-night-900"
                            />
                            <label className="flex items-center gap-1 text-[11px] text-slate-600">
                              顺序
                              <input
                                type="number"
                                min={0}
                                value={section.order}
                                onChange={(event) =>
                                  updateSection(index, { order: Number(event.target.value) })
                                }
                                className="w-16 rounded-lg border border-slate-300 px-1 py-1 text-xs"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-slate-600">
                              深度
                              <input
                                type="number"
                                min={0}
                                max={50}
                                value={section.depth}
                                onChange={(event) =>
                                  updateSection(index, { depth: Number(event.target.value) })
                                }
                                className="w-16 rounded-lg border border-slate-300 px-1 py-1 text-xs"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-slate-600">
                              <input
                                type="checkbox"
                                checked={section.enabled}
                                onChange={(event) =>
                                  updateSection(index, { enabled: event.target.checked })
                                }
                              />
                              启用
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSection(index)}
                              className="rounded-full border border-rose-300 px-2 py-1 text-[11px] text-rose-800"
                            >
                              移除
                            </button>
                          </div>
                          <label
                            htmlFor={`section-content-${section.id}`}
                            className="mt-2 block text-[11px] text-slate-500"
                          >
                            内容
                          </label>
                          <textarea
                            id={`section-content-${section.id}`}
                            value={section.content}
                            onChange={(event) =>
                              updateSection(index, { content: event.target.value })
                            }
                            rows={3}
                            className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 text-night-900"
                          />
                        </article>
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 disabled:opacity-60"
                    >
                      {saving ? "保存中…" : "保存为新版本"}
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
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Eyebrow>选择预设</Eyebrow>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                    从左侧选择或创建一个预设。段落顺序与启用状态会进入 Prompt 预览。
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {state.status === "authenticated" ? <RegexRulesPanel /> : null}
      </div>
    </div>
  );
}
