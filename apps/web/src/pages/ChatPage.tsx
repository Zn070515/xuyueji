import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider.js";
import { CloudChat } from "../components/CloudChat.js";
import { DemoDataNote, GateBadge, PageHeader } from "../components/Primitives.js";
import {
  DEMO_CHARACTER,
  DEMO_REPLIES,
  type DemoMessage,
  INITIAL_MESSAGES,
} from "../lib/demo-data.js";
import { useDraft } from "../lib/use-draft.js";

const PROMPT_BUDGET = [
  { label: "平台强制策略", tokens: 240, tone: "bg-moon-400" },
  { label: "角色卡", tokens: 680, tone: "bg-emerald-400/80" },
  { label: "世界书", tokens: 420, tone: "bg-sky-400/80" },
  { label: "历史路径", tokens: 1250, tone: "bg-indigo-400/80" },
  { label: "记忆", tokens: 0, tone: "bg-pink-400/80" },
  { label: "当前输入", tokens: 46, tone: "bg-amber-400/80" },
] as const;

const TOTAL_BUDGET = 8192;

function MessageBubble({ message }: { message: DemoMessage }) {
  if (message.role === "system") {
    return (
      <div className="my-4 flex justify-center">
        <p className="rounded-full border hairline bg-night-950/40 px-3 py-1 text-[11px] text-mist-400">
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
          <span>{isUser ? "你" : DEMO_CHARACTER.name}</span>
          {message.note ? (
            <span className="rounded-full border border-moon-400/25 px-2 py-0.5 text-[10px] text-moon-300">
              {message.note}
            </span>
          ) : null}
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

function BudgetBar({
  label,
  tokens,
  tone,
  max,
}: {
  label: string;
  tokens: number;
  tone: string;
  max: number;
}) {
  const percent = Math.min(100, Math.round((tokens / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-mist-300">
        <span>{label}</span>
        <span className="tabular-nums text-mist-400">{tokens.toLocaleString()} tok</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-50/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Inspector({ localState }: { localState: "loading" | "saved" | "unavailable" }) {
  return (
    <div className="space-y-4">
      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-paper-50">Prompt 预算</h3>
          <GateBadge gate="M2 接入" />
        </div>
        <p className="mt-1 text-[11px] leading-5 text-mist-400">
          以下为界面示意，不是本次请求的真实 token 明细。
        </p>
        <div className="mt-4 space-y-3">
          {PROMPT_BUDGET.map((item) => (
            <BudgetBar
              key={item.label}
              label={item.label}
              tokens={item.tokens}
              tone={item.tone}
              max={TOTAL_BUDGET}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-xs">
          <span className="text-mist-300">已用 / 预算</span>
          <span className="tabular-nums text-moon-300">
            2,636 / {TOTAL_BUDGET.toLocaleString()} tok
          </span>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-paper-50">世界书触发</h3>
          <GateBadge gate="M2" />
        </div>
        <ul className="mt-3 space-y-2">
          {[
            ["雨夜书店", "关键词：雨、书店", "常驻 · 优先级 10"],
            ["旧书与铜铃", "关键词：铜铃、翻页", "概率 80% · 深度 4"],
          ].map(([title, keys, meta]) => (
            <li key={title} className="rounded-xl border hairline bg-night-950/30 px-3 py-2">
              <p className="text-xs font-medium text-mist-200">{title}</p>
              <p className="mt-0.5 text-[11px] text-mist-400">{keys}</p>
              <p className="mt-0.5 text-[10px] text-moon-300/80">{meta}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-5 text-mist-400">
          条目为演示文案；触发、递归限制与预算裁剪将在 M2 由确定性编译器实现。
        </p>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-paper-50">长期记忆</h3>
          <GateBadge gate="M2" />
        </div>
        <p className="mt-3 rounded-xl border border-dashed hairline px-3 py-4 text-center text-[11px] leading-5 text-mist-400">
          暂无记忆条目。M2 将支持手动事实、自动摘要、时间线与可回滚的检索引文。
        </p>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-paper-50">草稿落点</h3>
          <GateBadge gate="本机 Dexie" tone="ready" />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-mist-300">
          {localState === "unavailable"
            ? "浏览器拒绝了本地存储，本次草稿不会保存。"
            : "输入框草稿保存在浏览器 IndexedDB，不上传服务器；云端权威存档在 M1 接入。"}
        </p>
      </section>
    </div>
  );
}

export function ChatPage() {
  const auth = useAuth();
  if (auth.state.status === "authenticated") {
    return <CloudChat />;
  }
  return <LocalChatPage showLoginHint={auth.state.status === "anonymous"} />;
}

function LocalChatPage({ showLoginHint }: { showLoginHint: boolean }) {
  const [messages, setMessages] = useState<DemoMessage[]>(() => [...INITIAL_MESSAGES]);
  const [replyIndex, setReplyIndex] = useState(0);
  const [isReplying, setIsReplying] = useState(false);
  const { draft, setDraft, localState } = useDraft("conversation_demo");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Messages and the typing indicator both change the scroll height.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must follow both
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, isReplying]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function sendMessage() {
    const text = draft.trim();
    if (!text || isReplying) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setDraft("");
    setIsReplying(true);

    timerRef.current = window.setTimeout(() => {
      const reply =
        DEMO_REPLIES[replyIndex % DEMO_REPLIES.length] ??
        DEMO_REPLIES[0] ??
        "书店里安静了一会儿，只有雨声落在窗上。";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          note: "本地演示回复（未调用模型）",
        },
      ]);
      setReplyIndex((current) => current + 1);
      setIsReplying(false);
      timerRef.current = null;
    }, 500);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="聊天 / Chat"
        title="把对话续下去，但先看清楚边界。"
        description="这是一个真实可交互的页面骨架：输入、发送与草稿落盘都在本机完成。它不会调用 DeepSeek，也不会保存到云端；右侧的 Prompt、世界书与记忆面板是明确的界面示意。"
        aside={<GateBadge gate="M1 页面 · M3 接入模型" tone="ready" />}
      />

      {showLoginHint ? (
        <div className="px-4 pt-4 sm:px-6">
          <p className="rounded-xl border border-moon-400/25 bg-moon-400/5 px-3 py-2 text-xs leading-6 text-moon-200">
            当前未登录，使用本地演示，消息不会离开浏览器。
            <Link className="ml-1 underline underline-offset-4" to="/login">
              登录
            </Link>
            后可使用写入 PostgreSQL 的云端会话与跨设备继续。
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass-card flex min-h-[620px] flex-col overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-4">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-moon-400/40 bg-night-900 font-display text-lg text-moon-300"
              >
                月
              </div>
              <div>
                <h2 className="font-display text-lg text-paper-50">{DEMO_CHARACTER.name}</h2>
                <p className="text-[11px] text-mist-400">{DEMO_CHARACTER.tagline}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-moon-300">{DEMO_CHARACTER.version} · 原创演示</p>
              <p className="text-[10px] text-mist-400">本地演示，不调用模型</p>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
            aria-label="对话记录"
            role="log"
            aria-live="polite"
          >
            <DemoDataNote>
              本会话不会向 DeepSeek 或任何第三方发送内容。演示角色与消息均为原创虚构示例。
            </DemoDataNote>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isReplying ? (
              <div className="flex items-center gap-2 pl-12 text-xs text-mist-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moon-400" />
                正在生成本地演示回复…
              </div>
            ) : null}
          </div>

          <div className="border-t hairline bg-night-950/40 px-4 py-4 sm:px-5">
            <label htmlFor="chat-input" className="sr-only">
              输入消息
            </label>
            <textarea
              id="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder="写下你想对店主说的话…（Enter 发送，Shift+Enter 换行）"
              className="min-h-[64px] w-full resize-none rounded-2xl border hairline bg-night-900/80 px-4 py-3 text-sm leading-6 text-paper-50 placeholder:text-mist-400 focus:border-moon-400/60 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-mist-400">
                草稿只存本机 IndexedDB
                {localState === "unavailable" ? "（当前不可用）" : ""} · 未连接模型
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  aria-describedby="stop-reason"
                  className="min-h-10 cursor-not-allowed rounded-full border hairline px-4 py-2 text-xs text-mist-400"
                >
                  停止生成
                </button>
                <button
                  type="button"
                  disabled
                  aria-describedby="regen-reason"
                  className="min-h-10 cursor-not-allowed rounded-full border hairline px-4 py-2 text-xs text-mist-400"
                >
                  重生成 / Swipe
                </button>
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={draft.trim().length === 0 || isReplying}
                  className="min-h-10 rounded-full bg-moon-400 px-5 py-2 text-sm font-semibold text-night-950 transition-colors hover:bg-moon-300 disabled:cursor-not-allowed disabled:bg-paper-50/10 disabled:text-mist-400"
                >
                  发送（本地演示）
                </button>
              </div>
            </div>
            <p id="stop-reason" className="sr-only">
              停止生成将在 M3 接入模型流后启用。
            </p>
            <p id="regen-reason" className="sr-only">
              重生成与 Swipe 候选将在 M3 接入模型运行态后启用。
            </p>
          </div>
        </section>

        <aside aria-label="Prompt 与运行时检查器" className="hidden lg:block">
          <Inspector localState={localState} />
        </aside>

        <details className="glass-card rounded-3xl p-4 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium text-paper-50">
            Prompt 与运行时检查器（示意）
          </summary>
          <div className="mt-4">
            <Inspector localState={localState} />
          </div>
        </details>
      </div>
    </div>
  );
}
