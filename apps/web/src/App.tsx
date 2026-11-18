import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider.js";
import { AppShell } from "./components/Layout.js";
import { CharactersPage } from "./pages/CharactersPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { HelpPage } from "./pages/HelpPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ContactPage, PrivacyPage, RefundsPage, TermsPage } from "./pages/LegalPages.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { PlannedPage } from "./pages/PlannedPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
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
      <AuthProvider>
        <ScrollToTop />
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/characters" element={<CharactersPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/wallet/checkout" element={<CheckoutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/lorebooks" element={<PlannedPage {...PLANNED_PAGES.lorebooks} />} />
            <Route path="/presets" element={<PlannedPage {...PLANNED_PAGES.presets} />} />
            <Route path="/memories" element={<PlannedPage {...PLANNED_PAGES.memories} />} />
            <Route path="/admin" element={<PlannedPage {...PLANNED_PAGES.admin} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}
