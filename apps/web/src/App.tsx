import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/Layout.js";
import { ChatPage } from "./pages/ChatPage.js";
import { HelpPage } from "./pages/HelpPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ContactPage, PrivacyPage, RefundsPage, TermsPage } from "./pages/LegalPages.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { PlannedPage } from "./pages/PlannedPage.js";
import { WalletPage } from "./pages/WalletPage.js";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    void pathname;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

const PLANNED_PAGES = {
  characters: {
    eyebrow: "角色 / Characters",
    title: "角色卡，是长篇的根。",
    description:
      "角色卡完整字段、多个开场白、示例消息、头像、标签与版本化，以及 V2/V3 JSON/PNG 导入导出。",
    gate: "M1 / M2",
    planned: [
      "角色与角色版本的 CAS 编辑",
      "V2/V3 角色卡 JSON 与 PNG 导入",
      "扩展字段 round-trip 与校验报告",
      "多开场白、示例消息、头像与标签",
      "角色列表、搜索与归档",
    ],
  },
  lorebooks: {
    eyebrow: "世界书 / Lorebooks",
    title: "让世界在需要时开口。",
    description:
      "常驻条目、主/次关键词、可选正则、扫描深度、概率、递归、优先级、预算、位置与有效范围。",
    gate: "M2",
    planned: [
      "确定性关键词与正则触发",
      "递归激活、环检测与深度/条目/字节限额",
      "位置、优先级、插入深度与预算裁剪",
      "每次命中的来源、理由与注入位置",
      "世界书导入导出与测试样本",
    ],
  },
  presets: {
    eyebrow: "预设 / Presets",
    title: "把 Prompt 变成可解释的编排。",
    description:
      "预设排序、启停、插入深度、作者注释、最终 Prompt 预览与 Token 明细；宏与正则有界执行。",
    gate: "M2",
    planned: [
      "Prompt Manager 与组件排序",
      "受限宏白名单解释器",
      "分阶段正则流水线与超时约束",
      "最终 Prompt 预览与 token 明细",
      "预设/正则导入导出",
    ],
  },
  memories: {
    eyebrow: "记忆 / Memories",
    title: "记住发生过的事，也记得它从哪来。",
    description: "手动事实、自动摘要、剧情时间线、角色关系、锁定与版本回退，以及可解释的检索引文。",
    gate: "M2",
    planned: [
      "manual_fact / event / summary / relationship 分类",
      "摘要待确认、人工纠错与回滚",
      "本地检索、按需引文与来源节点",
      "上下文 token 预算独立可控",
      "摘要请求的 usage 与费用可见",
    ],
  },
  settings: {
    eyebrow: "设置 / Settings",
    title: "同步、导入导出与隐私。",
    description:
      "云端权威存档、Dexie 缓存与 outbox、完整 ZIP 导出/导入、删除账号与聊天、备份保留说明。",
    gate: "M1",
    planned: [
      "PostgreSQL 权威存档与增量同步游标",
      "Dexie 本地缓存、草稿与 outbox",
      "CAS 冲突、tombstone 与 cursor 过期重建",
      "完整 ZIP 导出、导入 dry-run 与哈希校验",
      "账号删除、数据保留周期与备份说明",
    ],
  },
  admin: {
    eyebrow: "管理 / Admin",
    title: "后台不是普通用户的页面。",
    description: "风险日志、申诉与投诉、年龄保护、AI 标识、时长提醒、管理员操作审计与权限分离。",
    gate: "M4",
    planned: [
      "账务、客服、风控角色分离",
      "高危操作二次确认与审计",
      "风险事件与申诉工单",
      "AI 生成内容标识与使用时长提醒",
      "运营数据最小化与访问审批",
    ],
    note: "管理后台不会对普通用户开放；当前没有可用的管理员账号或演示入口。",
  },
} as const;

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refunds" element={<RefundsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/characters" element={<PlannedPage {...PLANNED_PAGES.characters} />} />
          <Route path="/lorebooks" element={<PlannedPage {...PLANNED_PAGES.lorebooks} />} />
          <Route path="/presets" element={<PlannedPage {...PLANNED_PAGES.presets} />} />
          <Route path="/memories" element={<PlannedPage {...PLANNED_PAGES.memories} />} />
          <Route path="/settings" element={<PlannedPage {...PLANNED_PAGES.settings} />} />
          <Route path="/admin" element={<PlannedPage {...PLANNED_PAGES.admin} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
