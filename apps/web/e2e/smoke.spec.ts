import { expect, test } from "@playwright/test";

test("首页展示可核对的服务状态与真实导航", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /续月记/ }).first()).toBeVisible();
  await expect(page.getByText(/不调用 DeepSeek/).first()).toBeVisible();

  await page.getByRole("link", { name: "进入聊天演示" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("heading", { name: /把对话续下去/ })).toBeVisible();
});

test("钱包页所有购买按钮都被禁用并给出原因", async ({ page }) => {
  await page.goto("/wallet");
  await expect(page.getByText("支付宝网站支付与商户资质尚未获批")).toBeVisible();

  const buttons = page.getByRole("button", { name: "支付未开通" });
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < count; index += 1) {
    await expect(buttons.nth(index)).toBeDisabled();
  }
});

test("聊天页的回复明确标注为本地演示", async ({ page }) => {
  await page.goto("/chat");
  const input = page.getByLabel("输入消息");
  await input.fill("今晚的书架上有新书吗？");
  await page.getByRole("button", { name: "发送（本地演示）" }).click();

  await expect(page.getByText("今晚的书架上有新书吗？")).toBeVisible();
  await expect(page.getByText("本地演示回复（未调用模型）").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "停止生成" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重生成 / Swipe" })).toBeDisabled();
});

test("法律与联系页面是真实页面而非静态占位", async ({ page }) => {
  for (const route of ["/terms", "/privacy", "/refunds", "/contact"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/草案/).first()).toBeVisible();
  }
});

test("未实现模块诚实地说明自己的 Gate", async ({ page }) => {
  await page.goto("/lorebooks");
  await expect(page.getByText("这个页面还不是功能页")).toBeVisible();
  await expect(page.getByText(/M2/).first()).toBeVisible();
});
