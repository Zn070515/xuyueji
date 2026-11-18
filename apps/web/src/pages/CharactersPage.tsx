import type { CharacterDetail, CharacterPayloadDto, CharacterSummaryDto } from "@xuyueji/contracts";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { DemoDataNote, Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";
import {
  addCharacterVersion,
  createCharacter,
  getCharacter,
  listCharacters,
} from "../lib/characters-api.js";
import { ApiError } from "../lib/http.js";

export function CharactersPage() {
  const { state } = useAuth();
  const [characters, setCharacters] = useState<CharacterSummaryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CharacterDetail | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCharacters();
      setCharacters(result.characters);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取角色失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.status === "authenticated") {
      void load();
    }
  }, [state.status, load]);

  function selectDetail(detail: CharacterDetail) {
    setSelected(detail);
    const active = detail.versions.find(
      (version) => version.id === detail.character.activeVersionId,
    );
    setEditName(active?.payload.name ?? detail.character.name);
    setEditDescription(active?.payload.description ?? "");
    setNotice(null);
    setError(null);
  }

  async function openCharacter(characterId: string) {
    try {
      selectDetail(await getCharacter(characterId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取角色详情失败。");
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createCharacter({
        name: newName.trim(),
        description: newDescription.trim(),
      });
      setNewName("");
      setNewDescription("");
      selectDetail(created);
      await load();
      setNotice("角色已写入 PostgreSQL。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建角色失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!selected?.character.activeVersionId) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const active = selected.versions.find(
      (version) => version.id === selected.character.activeVersionId,
    );
    const payload: CharacterPayloadDto = {
      ...(active?.payload ?? { name: "", description: "" }),
      name: editName.trim() || selected.character.name,
      description: editDescription.trim(),
    };

    try {
      const response = await addCharacterVersion({
        characterId: selected.character.id,
        expectedActiveVersionId: selected.character.activeVersionId,
        payload,
      });
      selectDetail(await getCharacter(selected.character.id));
      await load();
      setNotice(`已保存为版本 ${response.revision}。`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("另一台设备已经更新了这个角色。请刷新后再决定是否基于最新版本保存。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存失败。");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="角色 / Characters"
        title="云端角色与版本 CAS。"
        description="角色由不可变版本链与 active 指针组成。保存时携带 expectedActiveVersionId；另一台设备已更新时返回 409，不静默覆盖。"
        aside={<GateBadge gate="M1 基础 CRUD" tone="ready" />}
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
            <h2 className="mt-3 font-display text-2xl text-night-900">云端角色需要账号</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              登录后角色与版本会写入 PostgreSQL；未登录时只能使用本地聊天演示。
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
          <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
            <div className="space-y-5">
              <section className="glass-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-xl text-paper-50">新建角色</h2>
                  <GateBadge gate="CAS" tone="ready" />
                </div>
                <form onSubmit={handleCreate} className="mt-4 space-y-3">
                  <div>
                    <label htmlFor="character-name" className="text-xs text-mist-300">
                      名称
                    </label>
                    <input
                      id="character-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      maxLength={200}
                      required
                      className="mt-1.5 min-h-11 w-full rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="character-description" className="text-xs text-mist-300">
                      设定
                    </label>
                    <textarea
                      id="character-description"
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      rows={4}
                      className="mt-1.5 w-full resize-y rounded-xl border hairline bg-night-950/60 px-3 py-2 text-sm text-paper-50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950 hover:bg-moon-300 disabled:opacity-60"
                  >
                    {saving ? "正在写入…" : "创建并保存到云端"}
                  </button>
                </form>
                <div className="mt-4">
                  <DemoDataNote>
                    角色卡 V2/V3 导入、头像与多开场白在 M2 接入；这里是真实云端 CRUD 基础。
                  </DemoDataNote>
                </div>
              </section>

              <section className="glass-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-xl text-paper-50">我的角色</h2>
                  <span className="text-xs text-mist-400">{characters.length} 个</span>
                </div>
                {loading ? (
                  <p className="mt-4 text-xs text-mist-400">读取中…</p>
                ) : characters.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed hairline px-3 py-6 text-center text-xs text-mist-400">
                    还没有云端角色。
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {characters.map((character) => (
                      <li key={character.id}>
                        <button
                          type="button"
                          onClick={() => void openCharacter(character.id)}
                          className="w-full rounded-xl border hairline bg-night-950/40 px-3 py-2 text-left hover:border-moon-400/40"
                        >
                          <span className="block text-sm text-paper-50">{character.name}</span>
                          <span className="mt-0.5 block text-[11px] text-mist-400">
                            v{character.revision} ·{" "}
                            {new Date(character.updatedAt).toLocaleString("zh-CN")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="paper-card rounded-3xl p-6 sm:p-8">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Eyebrow>云端角色</Eyebrow>
                      <h2 className="mt-2 font-display text-2xl text-night-900">
                        {selected.character.name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        当前版本 v{selected.character.revision} · 共 {selected.versions.length}{" "}
                        个版本
                      </p>
                    </div>
                    <GateBadge gate="PostgreSQL" tone="ready" />
                  </div>

                  <form onSubmit={handleSave} className="mt-5 space-y-3">
                    <div>
                      <label htmlFor="edit-name" className="text-xs text-slate-500">
                        名称
                      </label>
                      <input
                        id="edit-name"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        maxLength={200}
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-night-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-description" className="text-xs text-slate-500">
                        设定
                      </label>
                      <textarea
                        id="edit-description"
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        rows={8}
                        className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-7 text-night-900"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex min-h-11 items-center rounded-full bg-night-900 px-5 py-2.5 text-sm font-medium text-paper-50 disabled:opacity-60"
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
                      {selected.versions.map((version) => (
                        <li
                          key={version.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="text-xs text-slate-600">
                            v{version.revision} · {version.sourceFormat}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(version.createdAt).toLocaleString("zh-CN")}
                            {version.id === selected.character.activeVersionId ? " · active" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Eyebrow>选择角色</Eyebrow>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-slate-600">
                    从左侧选择一个角色，或创建一个新角色。所有保存都会生成不可变版本，
                    过期设备保存会得到 409 冲突。
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
