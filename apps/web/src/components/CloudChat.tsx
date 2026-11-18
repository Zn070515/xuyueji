import type {
  CharacterSummaryDto,
  ConversationDetail,
  ConversationSummaryDto,
  MessageDto,
  PromptPreviewResponse,
} from "@xuyueji/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { listCharacters } from "../lib/characters-api.js";
import {
  appendUserMessage,
  createConversation,
  getConversation,
  listConversations,
  listMessages,
} from "../lib/conversations-api.js";
import { ApiError } from "../lib/http.js";
import { previewPrompt } from "../lib/prompt-api.js";
import { DemoDataNote, GateBadge, PageHeader } from "./Primitives.js";

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function CloudMessage({ message }: { message: MessageDto }) {
  if (message.tombstoneAt) {
    return (
      <div className="my-3 flex justify-center">
        <p className="rounded-full border hairline bg-night-950/40 px-3 py-1 text-[11px] text-mist-500">
          已删除的消息 · {formatTime(message.tombstoneAt)}
        </p>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="my-3 flex justify-center">
        <p className="rounded-full border hairline bg-night-950/40 px-3 py-1 text-center text-[11px] text-mist-400">
          {message.content}
        </p>
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div
          aria-hidden="true"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-moon-400/40 bg-night-900 font-display text-sm text-moon-300"
        >
          月
        </div>
      ) : null}
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "text-right" : "text-left"}`}>
        <div className="mb-1 flex items-center gap-2 text-[11px] text-mist-400">
          <span>{isUser ? "你" : "角色 / 系统"}</span>
          <span className="text-mist-500">{formatTime(message.createdAt)}</span>
        </div>
        <div
          className={[
            "whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7",
            isUser
              ? "rounded-tr-sm bg-paper-50 text-night-900"
              : "rounded-tl-sm border hairline bg-night-800/70 text-paper-100",
          ].join(" ")}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function CloudChat() {
  const [conversations, setConversations] = useState<ConversationSummaryDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingSend, setPendingSend] = useState<{
    readonly requestId: string;
    readonly content: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterSummaryDto[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [promptPreview, setPromptPreview] = useState<PromptPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const branch = useMemo(
    () => detail?.branches.find((candidate) => candidate.id === selectedBranchId) ?? null,
    [detail, selectedBranchId],
  );

  const loadConversation = useCallback(
    async (conversationId: string, options?: { preserveComposer?: boolean }) => {
      setLoading(true);
      setError(null);
      setNotice(null);
      setPromptPreview(null);
      try {
        const nextDetail = await getConversation(conversationId);
        const branchId =
          nextDetail.conversation.activeBranchId ?? nextDetail.branches[0]?.id ?? null;
        setDetail(nextDetail);
        setSelectedBranchId(branchId);
        setActiveId(conversationId);
        if (!options?.preserveComposer) {
          setPendingSend(null);
          setDraft("");
        }

        if (branchId) {
          const page = await listMessages({ conversationId, branchId, limit: 50 });
          setMessages(page.messages);
          setHasMore(page.hasMore);
          setNextBefore(page.nextBefore);
        } else {
          setMessages([]);
          setHasMore(false);
          setNextBefore(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "读取云端会话失败。");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    listConversations()
      .then((result) => {
        if (!active) {
          return;
        }
        setConversations(result.conversations);
        const first = result.conversations[0];
        if (first) {
          void loadConversation(first.id);
        } else {
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : "读取会话列表失败。");
        }
      });
    return () => {
      active = false;
    };
  }, [loadConversation]);

  useEffect(() => {
    let active = true;
    listCharacters()
      .then((result) => {
        if (!active) {
          return;
        }
        setCharacters(result.characters);
        setSelectedCharacterId((current) => current ?? result.characters[0]?.id ?? null);
      })
      .catch(() => {
        // The chat still works without a character; preview stays disabled.
      });
    return () => {
      active = false;
    };
  }, []);

  // New pages change the scroll height; messages is the intended trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows the message list
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  async function handleCreate() {
    setError(null);
    setNotice(null);
    try {
      const title = `云端会话 · ${new Date().toLocaleString("zh-CN")}`;
      const created = await createConversation(title);
      setConversations((current) => [created, ...current]);
      await loadConversation(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建会话失败。");
    }
  }

  async function handleLoadOlder() {
    if (!activeId || !selectedBranchId || !nextBefore) {
      return;
    }
    setError(null);
    try {
      const page = await listMessages({
        conversationId: activeId,
        branchId: selectedBranchId,
        before: nextBefore,
        limit: 50,
      });
      setMessages((current) => [...page.messages, ...current]);
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载更早消息失败。");
    }
  }

  async function handleSend() {
    if (!activeId || !branch || sending) {
      return;
    }
    const content = pendingSend?.content ?? draft.trim();
    if (!content) {
      return;
    }
    const request = pendingSend ?? {
      requestId: crypto.randomUUID(),
      content,
    };

    setPendingSend(request);
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await appendUserMessage({
        conversationId: activeId,
        branchId: branch.id,
        expectedBranchRevision: branch.revision,
        parentId: branch.headMessageId,
        content: request.content,
        requestId: request.requestId,
      });
      setDraft("");
      setPendingSend(null);
      setNotice("已写入 PostgreSQL。");
      const nextDetail = await getConversation(activeId);
      setDetail(nextDetail);
      const nextBranch =
        nextDetail.branches.find((candidate) => candidate.id === branch.id) ??
        nextDetail.branches[0];
      if (nextBranch) {
        setSelectedBranchId(nextBranch.id);
        const page = await listMessages({
          conversationId: activeId,
          branchId: nextBranch.id,
          limit: 50,
        });
        setMessages(page.messages);
        setHasMore(page.hasMore);
        setNextBefore(page.nextBefore);
      }
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeId
            ? { ...conversation, updatedAt: new Date().toISOString() }
            : conversation,
        ),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const message = "另一台设备已经推进了这个分支。已保留你的输入，请确认后重试发送。";
        setError(message);
        void loadConversation(activeId, { preserveComposer: true }).then(() => setError(message));
      } else {
        setError(cause instanceof Error ? cause.message : "发送失败。");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleBranch(branchId: string) {
    if (!activeId) {
      return;
    }
    setSelectedBranchId(branchId);
    setError(null);
    setPromptPreview(null);
    try {
      const page = await listMessages({ conversationId: activeId, branchId, limit: 50 });
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "切换分支失败。");
    }
  }

  async function handlePreview() {
    if (!activeId || !branch || !selectedCharacterId) {
      setPreviewError("先选择角色和分支，再生成 Prompt 预览。");
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const input = pendingSend?.content ?? (draft.trim() || "（预览）请继续故事。");
      const result = await previewPrompt({
        conversationId: activeId,
        branchId: branch.id,
        characterId: selectedCharacterId,
        userInput: input,
        maxOutputTokens: 800,
        contextWindowTokens: 8192,
        seed: 1,
      });
      setPromptPreview(result);
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : "生成 Prompt 预览失败。");
    } finally {
      setPreviewing(false);
    }
  }

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="聊天 / Cloud"
        title="云端会话与跨设备存档。"
        description="登录后消息写入 PostgreSQL；另一台设备重新打开同一会话即可继续。M3 接入模型前，这里只保存你发送的消息与分支结构，不会生成角色回复。"
        aside={<GateBadge gate="M1 云端会话 · M3 模型" tone="ready" />}
      />

      <div className="grid gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)_270px]">
        <aside className="space-y-3">
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-moon-400 px-4 py-2 text-sm font-semibold text-night-950 hover:bg-moon-300"
          >
            新建云端会话
          </button>
          <div className="glass-card rounded-2xl p-3">
            <p className="px-1 text-[11px] uppercase tracking-[0.2em] text-mist-400">会话列表</p>
            {conversations.length === 0 ? (
              <p className="px-1 py-4 text-xs leading-6 text-mist-400">
                还没有云端会话。点击上方按钮创建。
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => void loadConversation(conversation.id)}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left text-xs transition-colors",
                        conversation.id === activeId
                          ? "bg-paper-50/10 text-moon-200"
                          : "text-mist-300 hover:bg-paper-50/5",
                      ].join(" ")}
                    >
                      <span className="block truncate">{conversation.title}</span>
                      <span className="mt-0.5 block text-[10px] text-mist-500">
                        r{conversation.branchRevision} · {formatTime(conversation.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="glass-card flex min-h-[620px] flex-col overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-4 py-3">
            <div>
              <h2 className="font-display text-lg text-paper-50">
                {activeConversation?.title ?? "云端会话"}
              </h2>
              <p className="text-[11px] text-mist-400">
                {branch
                  ? `${branch.label} · revision ${branch.revision} · 分支 ${detail?.branches.length ?? 0}`
                  : "选择或新建会话"}
              </p>
            </div>
            <GateBadge gate="PostgreSQL 权威" tone="ready" />
          </div>

          {detail && detail.branches.length > 1 ? (
            <div className="flex flex-wrap gap-2 border-b hairline px-4 py-2">
              {detail.branches.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => void handleBranch(candidate.id)}
                  className={[
                    "rounded-full border px-3 py-1 text-[11px]",
                    candidate.id === selectedBranchId
                      ? "border-moon-400/50 bg-moon-400/10 text-moon-200"
                      : "border-paper-50/15 text-mist-400",
                  ].join(" ")}
                >
                  {candidate.label} · r{candidate.revision}
                </button>
              ))}
            </div>
          ) : null}

          <div
            ref={scrollRef}
            className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-5"
            aria-label="云端对话记录"
            role="log"
            aria-live="polite"
          >
            {hasMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleLoadOlder()}
                  className="rounded-full border hairline px-3 py-1 text-[11px] text-mist-300 hover:bg-paper-50/5"
                >
                  加载更早消息
                </button>
              </div>
            ) : null}

            {loading ? (
              <p className="py-8 text-center text-xs text-mist-400">正在读取云端消息…</p>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-mist-300">这个会话还没有消息。</p>
                <p className="mt-2 text-xs leading-6 text-mist-500">
                  发送第一条用户消息后，它会出现在 PostgreSQL，并在另一台设备上可见。
                </p>
              </div>
            ) : (
              messages.map((message) => <CloudMessage key={message.id} message={message} />)
            )}
          </div>

          <div className="border-t hairline bg-night-950/40 px-4 py-4">
            <label htmlFor="cloud-chat-input" className="sr-only">
              云端消息
            </label>
            <textarea
              id="cloud-chat-input"
              value={pendingSend?.content ?? draft}
              readOnly={pendingSend !== null}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              disabled={!branch || sending}
              placeholder={branch ? "写入一条云端消息…（Enter 发送）" : "先创建或选择一个会话"}
              className="min-h-[64px] w-full resize-none rounded-2xl border hairline bg-night-900/80 px-4 py-3 text-sm leading-6 text-paper-50 placeholder:text-mist-400 focus:border-moon-400/60 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] leading-5 text-mist-400">
                M3 前只保存用户消息，不调用模型 · 请求 ID 幂等
              </p>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!branch || sending || (!pendingSend && draft.trim().length === 0)}
                className="min-h-10 rounded-full bg-moon-400 px-5 py-2 text-sm font-semibold text-night-950 hover:bg-moon-300 disabled:cursor-not-allowed disabled:bg-paper-50/10 disabled:text-mist-400"
              >
                {sending ? "写入中…" : pendingSend ? "重试发送" : "发送到云端"}
              </button>
            </div>
            {notice ? (
              <p className="mt-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="mt-2 rounded-xl bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100"
              >
                {error}
              </p>
            ) : null}
            {pendingSend ? (
              <p className="mt-2 text-[11px] text-moon-300">
                上次发送未确认。重试会复用同一个请求 ID，避免重复写入。
              </p>
            ) : null}
          </div>
        </section>

        <aside className="space-y-3">
          <section className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-mist-400">Prompt 预览</p>
              <GateBadge gate="M2" tone="ready" />
            </div>

            {characters.length === 0 ? (
              <p className="mt-2 text-xs leading-6 text-mist-400">
                还没有可用于预览的角色。
                <Link className="ml-1 text-moon-300 underline underline-offset-4" to="/characters">
                  创建角色
                </Link>
              </p>
            ) : (
              <>
                <label htmlFor="prompt-character" className="mt-3 block text-[11px] text-mist-400">
                  预览角色
                </label>
                <select
                  id="prompt-character"
                  value={selectedCharacterId ?? ""}
                  onChange={(event) => {
                    setSelectedCharacterId(event.target.value || null);
                    setPromptPreview(null);
                  }}
                  className="mt-1 min-h-10 w-full rounded-xl border hairline bg-night-950/60 px-2 py-1.5 text-xs text-paper-50"
                >
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name} · v{character.revision}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewing || !branch || !selectedCharacterId}
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-full border border-moon-400/40 px-3 py-1.5 text-[11px] text-moon-200 hover:bg-moon-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {previewing ? "生成中…" : "生成 Prompt 预览"}
                </button>

                {previewError ? (
                  <p
                    role="alert"
                    className="mt-2 rounded-lg bg-rose-400/10 px-2 py-1.5 text-[10px] text-rose-100"
                  >
                    {previewError}
                  </p>
                ) : null}

                {promptPreview ? (
                  <div className="mt-3 space-y-2 rounded-xl border hairline bg-night-950/40 p-2 text-[11px] text-mist-300">
                    <p>
                      digest{" "}
                      <span className="font-mono text-moon-300">{promptPreview.plan.digest}</span>
                    </p>
                    <p>
                      {promptPreview.plan.estimatedInputTokens} input tok ·{" "}
                      {promptPreview.plan.reservedOutputTokens} reserved output
                    </p>
                    <p>世界书命中 {promptPreview.worldInfo.activated.length} 条</p>
                    {promptPreview.plan.warnings.length > 0 ? (
                      <ul className="list-disc pl-3 text-[10px] text-moon-300">
                        {promptPreview.plan.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <ul className="max-h-32 space-y-0.5 overflow-auto">
                      {promptPreview.plan.components.map((component) => (
                        <li
                          key={`${component.kind}:${component.sourceId}`}
                          className={
                            component.included ? "text-mist-200" : "text-mist-500 line-through"
                          }
                        >
                          {component.included ? "✓" : "×"} {component.kind} ·{" "}
                          {component.estimatedTokens} tok
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary className="cursor-pointer text-moon-300">查看 systemPrompt</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-5 text-mist-300">
                        {promptPreview.plan.systemPrompt}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="glass-card rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-mist-400">会话信息</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-mist-400">会话</dt>
                <dd className="truncate text-mist-200">{activeId?.slice(0, 8) ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mist-400">分支</dt>
                <dd className="text-mist-200">{detail?.branches.length ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mist-400">已加载</dt>
                <dd className="text-mist-200">{messages.length} 条</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mist-400">更早</dt>
                <dd className="text-mist-200">{hasMore ? "有" : "无"}</dd>
              </div>
            </dl>
          </section>

          <section className="glass-card rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-mist-400">跨设备</p>
            <p className="mt-2 text-xs leading-6 text-mist-300">
              同一账号在另一台设备打开此页，会从 PostgreSQL 拉取会话与消息。若另一台设备推进了分支，
              本次发送会得到 409；页面保留输入并自动刷新分支，确认后可重试发送。
            </p>
          </section>

          <section className="glass-card rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-mist-400">数据带走</p>
            <p className="mt-2 text-xs leading-6 text-mist-300">
              完整 JSON 导出在设置页；导出不包含密码、会话令牌或支付凭据。
            </p>
            <Link
              to="/settings"
              className="mt-3 inline-flex min-h-9 items-center rounded-full border border-moon-400/40 px-3 py-1.5 text-[11px] text-moon-200 hover:bg-moon-400/10"
            >
              打开设置
            </Link>
          </section>

          <DemoDataNote>
            角色回复生成在 M3 接入；当前云端会话是真实持久化，不是模拟消息。
          </DemoDataNote>
        </aside>
      </div>
    </div>
  );
}
