import { Link } from "react-router-dom";

import { Eyebrow } from "../components/Primitives.js";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <Eyebrow>404 / Not Found</Eyebrow>
      <h1 className="mt-4 font-display text-4xl text-paper-50">这一页没有续上。</h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-mist-300">
        链接可能指向尚未开放的模块，或者地址写错了。演示环境不会用占位页假装页面存在。
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-full bg-moon-400 px-5 py-2.5 text-sm font-semibold text-night-950 hover:bg-moon-300"
        >
          回到首页
        </Link>
        <Link
          to="/help"
          className="inline-flex min-h-11 items-center rounded-full border border-paper-50/20 px-5 py-2.5 text-sm text-paper-50 hover:bg-paper-50/5"
        >
          查看当前状态
        </Link>
      </div>
    </div>
  );
}
