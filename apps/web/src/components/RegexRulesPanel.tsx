import type { RegexRuleDto, RegexStage } from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "../auth/AuthProvider.js";
import { ApiError } from "../lib/http.js";
import {
  createRegexRule,
  deleteRegexRule,
  listRegexRules,
  testRegexRule,
  updateRegexRule,
} from "../lib/regex-rules-api.js";
import { DemoDataNote, Eyebrow, GateBadge } from "./Primitives.js";

const STAGE_LABELS: Record<RegexStage, string> = {
  user_input: "用户输入预处理",
  prompt_build: "Prompt 构建",
  model_output: "模型输出后处理",
  display_only: "仅展示",
};

interface Draft {
  title: string;
  stage: RegexStage;
  pattern: string;
  flags: string;
  replacement: string;
  sortOrder: number;
  enabled: boolean;
}

const EMPTY_DRAFT: Draft = {
  title: "",
  stage: "user_input",
  pattern: "",
  flags: "",
  replacement: "",
  sortOrder: 0,
  enabled: true,
};

function draftFrom(rule: RegexRuleDto): Draft {
  return {
    title: rule.title,
    stage: rule.stage,
    pattern: rule.pattern,
    flags: rule.flags,
    replacement: rule.replacement,
    sortOrder: rule.sortOrder,
    enabled: rule.enabled,
  };
}

export function RegexRulesPanel() {
  const { state } = useAuth();
  const [rules, setRules] = useState<RegexRuleDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [revision, setRevision] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [sample, setSample] = useState("今晚的月亮是红色的。");
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testStats, setTestStats] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listRegexRules();
    setRules(result.rules);
    return result.rules;
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
          setDraft(draftFrom(first));
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "读取正则规则失败。");
        }
      });
    return () => {
      active = false;
    };
  }, [state.status, load]);

  function selectRule(rule: RegexRuleDto) {
    setSelectedId(rule.id);
    setRevision(rule.revision);
    setDraft(draftFrom(rule));
    setCreating(false);
    setDeleteCandidate(null);
    setError(null);
    setNotice(null);
    setTestOutput(null);
    setTestStats(null);
  }

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setRevision(null);
    setDraft(EMPTY_DRAFT);
    setDeleteCandidate(null);
    setError(null);
    setNotice(null);
    setTestOutput(null);
    setTestStats(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.pattern.trim()) {
      setError("规则需要标题和表达式。");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (creating || !selectedId || revision === null) {
        const created = await createRegexRule({
          title: draft.title.trim(),
          stage: draft.stage,
          pattern: draft.pattern,
          flags: draft.flags,
          replacement: draft.replacement,
          sortOrder: draft.sortOrder,
          enabled: draft.enabled,
        });
        setCreating(false);
        setSelectedId(created.id);
        setRevision(created.revision);
        setDraft(draftFrom(created));
        setNotice("正则规则已创建。");
      } else {
        const updated = await updateRegexRule(selectedId, {
          title: draft.title.trim(),
          stage: draft.stage,
          pattern: draft.pattern,
          flags: draft.flags,
          replacement: draft.replacement,
          sortOrder: draft.sortOrder,
          enabled: draft.enabled,
          expectedRevision: revision,
        });
        setRevision(updated.revision);
        setDraft(draftFrom(updated));
        setNotice(`已保存为版本 ${updated.revision}。`);
      }
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已更新这条规则；本地编辑保留，请刷新后再合并。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存正则规则失败。");
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
      await deleteRegexRule(selectedId);
      const list = await load();
      const first = list[0];
      if (first) {
        selectRule(first);
      } else {
        startCreate();
      }
      setNotice("正则规则已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除正则规则失败。");
    }
  }

  async function handleTest() {
    setTestOutput(null);
    setTestStats(null);
    setError(null);
    try {
      const result = await testRegexRule({
        pattern: draft.pattern,
        flags: draft.flags,
        replacement: draft.replacement,
        sample,
      });
      setTestOutput(result.output);
      setTestStats(`命中 ${result.matchCount} 处 · ${result.steps} 步`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "试运行失败。");
    }
  }

  if (state.status !== "authenticated") {
    return null;
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>正则 / Regex</Eyebrow>
          <h2 className="mt-2 font-display text-2xl text-paper-50">受控正则规则</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-mist-400">
            只支持安全子集：嵌套无限量词、环视、命名组和反向引用会被拒绝；每次执行有步数、输入长度与匹配数上限。
          </p>
        </div>
        <GateBadge gate="M2 Regex" tone="ready" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <section className="glass-card rounded-3xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg text-paper-50">我的规则</h3>
              <span className="text-[11px] text-mist-400">{rules.length} 条</span>
            </div>
            {rules.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                还没有正则规则。
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => selectRule(rule)}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left",
                        rule.id === selectedId
                          ? "bg-paper-50/10 text-moon-200"
                          : "text-mist-300 hover:bg-paper-50/5",
                      ].join(" ")}
                    >
                      <span className="block truncate text-sm">{rule.title}</span>
                      <span className="mt-0.5 block text-[10px] text-mist-500">
                        {STAGE_LABELS[rule.stage]} · 顺序 {rule.sortOrder} · r{rule.revision} ·{" "}
                        {rule.enabled ? "启用" : "停用"}
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
              新建正则规则
            </button>
          </section>

          <DemoDataNote>
            正则只在服务端登记的服务管道里执行，不执行任意 JavaScript，也不能改写平台策略。
          </DemoDataNote>
        </div>

        <section className="paper-card rounded-3xl p-6 sm:p-8">
          <form onSubmit={handleSave}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Eyebrow>{creating ? "新建正则规则" : "编辑正则规则"}</Eyebrow>
                <label htmlFor="regex-title" className="sr-only">
                  规则标题
                </label>
                <input
                  id="regex-title"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  maxLength={120}
                  placeholder="例如：把括号旁白换成斜体标记"
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-display text-xl text-night-900"
                />
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
                  {deleteCandidate === selectedId ? "确认删除规则" : "删除规则"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                阶段
                <select
                  value={draft.stage}
                  onChange={(event) =>
                    setDraft({ ...draft, stage: event.target.value as RegexStage })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                >
                  {Object.entries(STAGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                顺序
                <input
                  type="number"
                  min={0}
                  value={draft.sortOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, sortOrder: Number(event.target.value) })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-night-900"
                />
              </label>
            </div>

            <label htmlFor="regex-pattern" className="mt-3 block text-xs text-slate-600">
              表达式
            </label>
            <input
              id="regex-pattern"
              value={draft.pattern}
              onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}
              maxLength={2000}
              spellCheck={false}
              placeholder="（[^）]+）"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-night-900"
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
              <label className="block text-xs text-slate-600">
                标志
                <input
                  value={draft.flags}
                  onChange={(event) => setDraft({ ...draft, flags: event.target.value })}
                  maxLength={10}
                  spellCheck={false}
                  placeholder="ims"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-night-900"
                />
              </label>
              <label className="block text-xs text-slate-600">
                替换为（支持 $1、$0、$$）
                <input
                  value={draft.replacement}
                  onChange={(event) => setDraft({ ...draft, replacement: event.target.value })}
                  maxLength={10_000}
                  spellCheck={false}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-night-900"
                />
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              启用这条规则
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存正则规则"}
              </button>
              <button
                type="button"
                onClick={() => void handleTest()}
                className="inline-flex min-h-10 items-center rounded-full border border-night-900/20 px-4 py-2 text-xs text-night-900"
              >
                试运行
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label htmlFor="regex-sample" className="block text-xs text-slate-600">
                试运行样本
              </label>
              <textarea
                id="regex-sample"
                value={sample}
                onChange={(event) => setSample(event.target.value)}
                rows={3}
                className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 text-night-900"
              />
              {testOutput !== null ? (
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500">{testStats}</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2 font-mono text-xs text-night-900">
                    {testOutput}
                  </pre>
                </div>
              ) : null}
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
    </section>
  );
}
