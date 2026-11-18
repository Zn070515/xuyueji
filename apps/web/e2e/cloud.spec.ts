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

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /待同步操作/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^xuyueji-export-.*\.json$/);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByText("尚未登录")).toBeVisible();
});
