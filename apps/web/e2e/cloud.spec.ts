import { expect, test } from "@playwright/test";

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

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /待同步操作/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^xuyueji-export-.*\.json$/);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByText("尚未登录")).toBeVisible();
});
