import { Link } from "react-router-dom";

import { Eyebrow, GateBadge, PageHeader } from "../components/Primitives.js";

export interface PlannedPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly gate: string;
  readonly planned: readonly string[];
  readonly note?: string;
}

export function PlannedPage({
  eyebrow,
  title,
  description,
  gate,
  planned,
  note,
}: PlannedPageProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        aside={<GateBadge gate={gate} />}
      />

      <div className="px-4 py-8 sm:px-6">
        <div className="paper-card rounded-3xl p-6 sm:p-8">
          <Eyebrow>这个页面还不是功能页</Eyebrow>
          <h2 className="mt-3 font-display text-2xl text-night-900">为什么现在是空的？</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            续月记不会用静态占位页冒充已完成功能。这里只登记该模块的交付边界与
            Gate。后端领域模型、端口与测试会在对应 Gate 一并交付，再开放给用户使用。
          </p>

          <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
            {note ?? "当前没有真实用户数据被处理。"}
          </p>

          <h3 className="mt-6 text-sm font-semibold text-night-900">计划包含</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {planned.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-xs leading-6 text-slate-600"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/help"
              className="inline-flex min-h-10 items-center rounded-full bg-night-900 px-4 py-2 text-xs font-medium text-paper-50 hover:bg-night-800"
            >
              查看当前状态
            </Link>
            <Link
              to="/chat"
              className="inline-flex min-h-10 items-center rounded-full border border-night-900/20 px-4 py-2 text-xs font-medium text-night-900 hover:bg-night-900/5"
            >
              回到聊天演示
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
