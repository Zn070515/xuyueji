import { expect, test } from "@playwright/test";

test("a cloud message is visible on a second device", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "跨设备流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `cross-${suffix}@example.com`;
  const password = "correct horse battery staple";
  const message = `跨设备消息 ${suffix}`;

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("跨设备用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "云端会话与跨设备存档。" })).toBeVisible();
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill(message);
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText("已写入 PostgreSQL。")).toBeVisible();

  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("邮箱").fill(email);
    await pageB.getByLabel("密码", { exact: true }).fill(password);
    await pageB.getByRole("button", { name: "登录" }).click();
    await expect(pageB).toHaveURL(/\/settings$/);

    await pageB.goto("/chat");
    await expect(pageB.getByRole("heading", { name: "云端会话与跨设备存档。" })).toBeVisible();
    await expect(pageB.getByText(message)).toBeVisible({ timeout: 15_000 });

    await pageB.locator("#cloud-chat-input").fill("B 追加消息");
    await pageB.getByRole("button", { name: "发送到云端" }).click();
    await expect(pageB.getByText("B 追加消息")).toBeVisible();

    // Device A still has the old branch revision. Its write must conflict,
    // keep the draft, and allow an idempotent retry after refreshing.
    await page.locator("#cloud-chat-input").fill("A 的草稿");
    await page.getByRole("button", { name: "发送到云端" }).click();
    await expect(page.getByText(/另一台设备已经推进了这个分支/)).toBeVisible();
    await expect(page.locator("#cloud-chat-input")).toHaveValue("A 的草稿");
    await page.getByRole("button", { name: "重试发送" }).click();
    await expect(page.getByText("A 的草稿")).toBeVisible();
    await expect(page.getByText("B 追加消息").first()).toBeVisible();
  } finally {
    await contextB.close();
  }
});

test("world info entry affects the prompt preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "世界书流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `lore-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("世界书用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/characters");
  await page.locator("#character-name").fill("世界书测试角色");
  await page.locator("#character-description").fill("用于 Prompt 预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "世界书测试角色" })).toBeVisible();

  await page.goto("/lorebooks");
  await expect(page.getByRole("heading", { name: "让设定在需要时出现。" })).toBeVisible();
  await page.locator("#lorebook-title").fill("雨夜书店");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByRole("heading", { name: "雨夜书店" })).toBeVisible();

  await page.getByRole("button", { name: "新建条目" }).click();
  await page.locator("#lore-content").fill("雨夜书店会亮起铜灯。");
  await page.locator("#lore-keys").fill("雨");
  await page.getByRole("button", { name: "保存条目" }).click();
  await expect(page.getByText("条目已创建。")).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("雨夜的书店");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("雨夜的书店")).toBeVisible();

  await page.getByRole("checkbox", { name: "雨夜书店" }).check();
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/世界书命中\s*1/)).toBeVisible();
  await page.getByText("查看 systemPrompt").click();
  await expect(page.getByText("雨夜书店会亮起铜灯。")).toBeVisible();
});

test("display-only regex is applied when messages render", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "展示正则流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `display-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("展示正则用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/presets");
  await page.getByRole("button", { name: "新建正则规则" }).click();
  await page.locator("#regex-title").fill("E2E 展示正则");
  await page.locator("#regex-pattern").fill("晚安");
  await page.getByLabel("阶段").selectOption("display_only");
  await page.locator("#regex-sample").fill("晚安。");
  await page.getByRole("button", { name: "保存正则规则" }).click();
  await expect(page.getByText("正则规则已创建。")).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("晚安。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("已写入 PostgreSQL。")).toBeVisible();
  await expect(page.getByText("晚安。")).toHaveCount(0);
});

test("world info entry can trigger on a safe regex", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "正则世界书流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `lore-regex-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("正则世界书用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/characters");
  await page.locator("#character-name").fill("正则世界书角色");
  await page.locator("#character-description").fill("用于正则触发预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "正则世界书角色" })).toBeVisible();

  await page.goto("/lorebooks");
  await page.locator("#lorebook-title").fill("月光档案");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByRole("heading", { name: "月光档案" })).toBeVisible();

  await page.getByRole("button", { name: "新建条目" }).click();
  await page.locator("#lore-content").fill("月光会显影旧字。");
  await page.locator("#lore-match-mode").selectOption("regex");
  await page.locator("#lore-regex").fill("月光|铜灯");
  await page.getByRole("button", { name: "保存条目" }).click();
  await expect(page.getByText("条目已创建。")).toBeVisible();
  await expect(page.getByText("正则：月光|铜灯")).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("月光落在柜台上。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("月光落在柜台上。")).toBeVisible();

  await page.getByRole("checkbox", { name: "月光档案" }).check();
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/世界书命中\s*1/)).toBeVisible();
  await page.getByText("查看 systemPrompt").click();
  await expect(page.getByText("月光会显影旧字。")).toBeVisible();
});

test("persona is selectable in the prompt preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Persona 流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `persona-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("Persona 用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/personas");
  await expect(page.getByRole("heading", { name: "让角色知道你正在扮演谁。" })).toBeVisible();
  await page.locator("#persona-name").fill("E2E Persona");
  await page.locator("#persona-description").fill("冷静的旅人");
  await page.getByRole("button", { name: "创建 Persona" }).click();
  await expect(page.getByRole("heading", { name: "E2E Persona" })).toBeVisible();

  await page.goto("/characters");
  await page.locator("#character-name").fill("Persona 测试角色");
  await page.locator("#character-description").fill("用于 Persona 预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "Persona 测试角色" })).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("你好，旅人。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("你好，旅人。")).toBeVisible();

  await page.getByLabel("Persona（可选）").selectOption({ label: "E2E Persona · v1" });
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/digest/)).toBeVisible();
  await page.getByText("查看 systemPrompt").click();
  await expect(page.getByText("用户人格：E2E Persona")).toBeVisible();
});

test("preset sections are selectable in the prompt preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "预设流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `preset-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("预设用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/presets");
  await expect(page.getByRole("heading", { name: "把系统提示编排成可复用的预设。" })).toBeVisible();
  await page.locator("#preset-title").fill("E2E 预设");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.locator("#preset-edit-title")).toHaveValue("E2E 预设");
  await page.getByRole("button", { name: "添加段落" }).click();
  await page.getByLabel("段落标题").fill("风格");
  await page.getByLabel("内容").fill("预设内容：用简洁的句子。");
  await page.getByRole("button", { name: "保存为新版本" }).click();
  await expect(page.getByText(/预设已保存为版本\s*2/)).toBeVisible();

  await page.goto("/characters");
  await page.locator("#character-name").fill("预设测试角色");
  await page.locator("#character-description").fill("用于预设预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "预设测试角色" })).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("你好。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("你好。")).toBeVisible();

  await page.locator("#prompt-preset").selectOption({ index: 1 });
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/digest/)).toBeVisible();
  await page.getByText("查看 systemPrompt").click();
  await expect(page.getByText("预设内容：用简洁的句子。")).toBeVisible();
});

test("regex rule rewrites the prompt input", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "正则流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `regex-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("正则用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/presets");
  await expect(page.getByRole("heading", { name: "受控正则规则" })).toBeVisible();
  await page.getByRole("button", { name: "新建正则规则" }).click();
  await page.locator("#regex-title").fill("E2E 正则");
  await page.locator("#regex-pattern").fill("你好");
  await page.locator("#regex-sample").fill("你好，书店。");
  await page.getByRole("button", { name: "试运行" }).click();
  await expect(page.getByText(/命中 1 处/)).toBeVisible();
  await page.getByRole("button", { name: "保存正则规则" }).click();
  await expect(page.getByText("正则规则已创建。")).toBeVisible();

  await page.goto("/characters");
  await page.locator("#character-name").fill("正则测试角色");
  await page.locator("#character-description").fill("用于正则预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "正则测试角色" })).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("你好。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("你好。")).toBeVisible();

  await page.locator("#cloud-chat-input").fill("你好。");
  await page.getByRole("checkbox", { name: /E2E 正则/ }).check();
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/digest/)).toBeVisible();
  await expect(page.getByText("正则生效 1 条")).toBeVisible();
  await expect(page.getByText("用户输入已被 user_input 阶段规则改写")).toBeVisible();
});

test("locked and matched memories are injected into the preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "记忆流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `memory-${suffix}@example.com`;
  const password = "correct horse battery staple";

  await page.goto("/register");
  await page.getByLabel("显示名称").fill("记忆用户");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill(password);
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/memories");
  await expect(page.getByRole("heading", { name: "让角色记住真正重要的事。" })).toBeVisible();
  await page.getByRole("button", { name: "新建记忆" }).click();
  await page.locator("#memory-content").fill("锁定的旧伤：主角怕水。");
  await page.getByLabel(/锁定（总是注入/).check();
  await page.getByRole("button", { name: "保存记忆" }).click();
  await expect(page.getByText("记忆已创建。")).toBeVisible();

  await page.goto("/characters");
  await page.locator("#character-name").fill("记忆测试角色");
  await page.locator("#character-description").fill("用于记忆预览");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByRole("heading", { name: "记忆测试角色" })).toBeVisible();

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("你好。");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("你好。")).toBeVisible();

  await page.getByLabel("启用长期记忆检索（按当前输入）").check();
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/digest/)).toBeVisible();
  await expect(page.getByText("记忆注入 1 条")).toBeVisible();
  await page.getByText("查看 systemPrompt").click();
  await expect(page.locator("pre", { hasText: "锁定的旧伤：主角怕水。" })).toBeVisible();
});

test("register, save a cloud character version and export", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "云端流程只需在桌面项目跑一次");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${suffix}@example.com`;

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "创建演示账号" })).toBeVisible();
  await page.getByLabel("显示名称").fill("E2E 测试者");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel(/密码（至少 12 位）/).fill("correct horse battery staple");
  await page.getByLabel(/我确认已年满/).check();
  await page.getByRole("button", { name: "创建账号" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.goto("/characters");
  await expect(page.getByRole("heading", { name: "云端角色与版本 CAS。" })).toBeVisible();
  await page.locator("#character-name").fill("E2E 角色");
  await page.locator("#character-description").fill("第一版设定");
  await page.getByRole("button", { name: "创建并保存到云端" }).click();
  await expect(page.getByText("角色已写入 PostgreSQL。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E 角色" })).toBeVisible();

  await page.locator("#edit-description").fill("第二版设定");
  await page.getByRole("button", { name: "保存为新版本" }).click();
  await expect(page.getByText("已保存为版本 2。")).toBeVisible();

  const importCard = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    x_unknown_top: "preserve-me",
    data: {
      name: "E2E 导入角色",
      description: "从 V2 JSON 导入",
      first_mes: "你来了。",
      alternate_greetings: ["另一个开场白"],
      creator: "fixture",
      character_version: "1.0",
      x_unknown_data: { keep: true },
    },
  };
  await page.setInputFiles("#character-import", {
    name: "card.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importCard)),
  });
  await expect(page.getByText("角色卡已导入并保存到云端。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E 导入角色" })).toBeVisible();
  await expect(page.getByText(/未识别顶层字段\s*1/)).toBeVisible();

  const cardDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 V2 JSON" }).click();
  const cardDownload = await cardDownloadPromise;
  expect(cardDownload.suggestedFilename()).toMatch(/character-.*-v2\.json$/);

  await page.goto("/chat");
  await page.getByRole("button", { name: "新建云端会话" }).click();
  await page.locator("#cloud-chat-input").fill("Prompt 预览测试");
  await page.getByRole("button", { name: "发送到云端" }).click();
  await expect(page.getByText("Prompt 预览测试")).toBeVisible();
  await page.getByRole("button", { name: "生成 Prompt 预览" }).click();
  await expect(page.getByText(/digest/)).toBeVisible();
  await expect(page.getByText(/character ·/)).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /待同步操作/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^xuyueji-export-.*\.json$/);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByText("尚未登录")).toBeVisible();
});
