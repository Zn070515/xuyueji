import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

const screenshotDir = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "artifacts/screenshots",
);

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

/**
 * Playwright's full-page capture paints sticky/fixed elements at the scroll
 * position where it started, which can overlay mid-page content. For an
 * accurate full-page artifact, pin the header into normal flow first.
 */
async function stabilizeFullPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const header = document.querySelector("header");
    if (header instanceof HTMLElement) {
      header.style.position = "static";
    }
    const mobileNav = document.querySelector('nav[aria-label="移动端导航"]');
    if (mobileNav instanceof HTMLElement) {
      mobileNav.style.display = "none";
    }
  });
}

test.describe("真实渲染页面截图", () => {
  test("首页、钱包与聊天三张真实截图", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "桌面截图仅使用桌面项目");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /续月记/ }).first()).toBeVisible();
    await expect(page.getByText(/M1 演示环境/).first()).toBeVisible();
    await stabilizeFullPage(page);
    await page.screenshot({
      path: path.join(screenshotDir, "home.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto("/wallet");
    await expect(page.getByRole("heading", { name: /余额由服务端决定/ })).toBeVisible();
    await expect(page.getByText("支付未开通").first()).toBeVisible();
    const disabledButtons = page.getByRole("button", { name: "支付未开通" });
    const count = await disabledButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(disabledButtons.nth(index)).toBeDisabled();
    }
    await stabilizeFullPage(page);
    await page.screenshot({
      path: path.join(screenshotDir, "wallet.png"),
      fullPage: true,
      animations: "disabled",
    });

    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: /把对话续下去/ })).toBeVisible();
    await page.getByLabel("输入消息").fill("我想找一本关于月亮的书。");
    await page.getByRole("button", { name: "发送（本地演示）" }).click();
    await expect(page.getByText("本地演示回复（未调用模型）")).toHaveCount(2);
    await page
      .getByLabel("对话记录")
      .evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await stabilizeFullPage(page);
    await page.screenshot({
      path: path.join(screenshotDir, "chat.png"),
      fullPage: true,
      animations: "disabled",
    });
  });

  test("手机 H5 截图：首页 / 商品服务 / 支付页", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "仅手机项目");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /续月记/ }).first()).toBeVisible();
    await stabilizeFullPage(page);
    await page.screenshot({
      path: path.join(screenshotDir, "home-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.screenshot({
      path: path.join(screenshotDir, "h5-home.png"),
      fullPage: false,
      animations: "disabled",
    });

    await page.goto("/wallet");
    await expect(page.getByRole("heading", { name: /余额由服务端决定/ })).toBeVisible();
    await expect(page.getByText("体验包").first()).toBeVisible();
    await stabilizeFullPage(page);
    await page.locator("#packages").screenshot({
      path: path.join(screenshotDir, "h5-service.png"),
      animations: "disabled",
    });

    await page.goto("/wallet/checkout");
    await expect(page.getByRole("heading", { name: "确认积分订单" })).toBeVisible();
    await expect(page.getByText("支付宝商户入驻与网站支付产品尚未获批")).toBeVisible();
    await expect(page.getByRole("button", { name: "确认支付（未开通）" })).toBeDisabled();
    await stabilizeFullPage(page);
    await page.locator("#checkout-card").screenshot({
      path: path.join(screenshotDir, "h5-payment.png"),
      animations: "disabled",
    });
  });
});
