export const DEMO_CHARACTER = {
  id: "character_demo",
  name: "星月书店店主",
  version: "v1",
  tagline: "原创演示角色 · 只在月夜开门的旧书店",
  tags: ["原创", "演示", "书店", "长篇角色扮演"],
} as const;

export type DemoRole = "system" | "user" | "assistant";

export interface DemoMessage {
  readonly id: string;
  readonly role: DemoRole;
  readonly content: string;
  readonly note?: string;
}

export const INITIAL_MESSAGES: readonly DemoMessage[] = [
  {
    id: "message_demo_system",
    role: "system",
    content: "演示会话：所有内容为本地示例，不会发送给任何模型。",
  },
  {
    id: "message_demo_user_1",
    role: "user",
    content: "今晚书店还开着吗？我循着灯光走了很久。",
  },
  {
    id: "message_demo_assistant_1",
    role: "assistant",
    content:
      "你来得正好。今晚的书架，好像又多了几本没见过的书。\n\n窗外的雨把街灯拉得很长。她把一盏小灯移到桌边，示意你坐下。",
    note: "本地演示回复（未调用模型）",
  },
];

export const DEMO_REPLIES: readonly string[] = [
  "她合上手里的书，指尖停在书脊上。「有些故事，只有在雨声里才肯继续。」\n\n铜铃又响了一声，门外却没有风。",
  "「先别急着问结局。」她推来一杯温热的茶，「你要找的那本书，可能也在找你。」\n\n书架深处传来极轻的翻页声。",
  "她抬头看向你，像是在确认某件很久以前的事。「你上次离开时，把一句话落在了这里。」\n\n她把一张泛黄的纸推到你面前。",
];

export interface PlannedFeature {
  readonly title: string;
  readonly description: string;
  readonly gate: string;
  readonly state: "已建立底座" | "计划中" | "未开放";
}

export const PLANNED_FEATURES: readonly PlannedFeature[] = [
  {
    title: "角色卡与世界书",
    description: "V2/V3 导入导出、版本化角色、世界书触发与预算。",
    gate: "M2",
    state: "计划中",
  },
  {
    title: "消息图与分支",
    description: "Swipe 候选、历史分支、编辑不改写旧历史。",
    gate: "M1 / M2",
    state: "已建立底座",
  },
  {
    title: "长期记忆",
    description: "手动事实、自动摘要、检索引文与版本回退。",
    gate: "M2",
    state: "计划中",
  },
  {
    title: "跨设备云端存档",
    description: "PostgreSQL 权威存档，Dexie 缓存与离线草稿。",
    gate: "M1",
    state: "计划中",
  },
  {
    title: "透明积分账本",
    description: "冻结、结算、退款全走不可变账本，余额由服务端决定。",
    gate: "M3",
    state: "已建立底座",
  },
  {
    title: "兼容导入导出",
    description: "角色卡、世界书、预设、JSONL 与完整 ZIP 可带走。",
    gate: "M1 / M2",
    state: "计划中",
  },
];

/**
 * Display-only draft. It is NOT a live tariff and never reaches a checkout.
 * M3 will load packages from the server-side, versioned tariff table after
 * checking official DeepSeek pricing and cost margin.
 */
export interface DraftPackage {
  readonly name: string;
  readonly amountLabel: string;
  readonly pointsLabel: string;
  readonly note: string;
}

export const DRAFT_PACKAGES: readonly DraftPackage[] = [
  {
    name: "体验包",
    amountLabel: "¥6（草案）",
    pointsLabel: "60 积分（草案）",
    note: "适合试用一次短篇对话。",
  },
  {
    name: "常用包",
    amountLabel: "¥30（草案）",
    pointsLabel: "330 积分（草案）",
    note: "适合持续推进一条主线。",
  },
  {
    name: "长篇包",
    amountLabel: "¥68（草案）",
    pointsLabel: "800 积分（草案）",
    note: "适合多角色、长章节与多次分支。",
  },
];

export const CAPABILITY_NOTES = [
  {
    label: "模型调用",
    value: "未启用",
    detail: "M3 接入 DeepSeek 官方 API；当前聊天页不会发出任何模型请求。",
  },
  {
    label: "真实支付",
    value: "未启用",
    detail: "支付宝商户准入未完成；充值按钮禁用，不接收真实付款。",
  },
  {
    label: "公开注册",
    value: "未启用",
    detail: "M1 实现账号、会话与对象级授权后才会开放。",
  },
  {
    label: "演示数据",
    value: "进程内",
    detail: "API 重启即清空；不是用户存档，也不会进入任何生产库。",
  },
] as const;
