import { expect, test } from "@playwright/test";

test("daily reading, reflection, archive, insights and settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /의 뉴스/ })).toBeVisible();

  for (const category of ["정치", "사회", "과학", "IT·정보", "경제"]) {
    await expect(page.getByRole("heading", { name: category, exact: true })).toBeVisible();
  }

  const firstCard = page.locator(".news-card").first();
  await firstCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(firstCard.getByRole("heading", { name: "무슨 일이 있었나" })).toBeVisible();
  await expect(firstCard.locator(".source-block a").first()).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator(".progress-meta")).toContainText(/1 \/ [5-9]|1 \/ 10/);

  const reflection = "이 변화의 비용이 누구에게 먼저 돌아가는지 더 확인하고 싶다.";
  await firstCard.getByPlaceholder("두세 문장으로 생각을 남겨보세요.").fill(reflection);
  await page.waitForTimeout(800);
  await expect(firstCard.getByText("저장됨")).toBeVisible();

  await page.reload();
  const reloadedFirstCard = page.locator(".news-card").first();
  await reloadedFirstCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(reloadedFirstCard.getByPlaceholder("두세 문장으로 생각을 남겨보세요.")).toHaveValue(reflection);
  await expect(page.locator(".progress-meta")).toContainText(/1 \/ [5-9]|1 \/ 10/);

  await page.getByRole("link", { name: "지난 뉴스" }).click();
  await expect(page.getByRole("heading", { name: "지난 뉴스" })).toBeVisible();
  await expect(page.locator(".archive-row")).toContainText(/\d+개 핵심/);

  await page.getByRole("link", { name: "생각" }).click();
  await expect(page.locator(".insight-card")).toHaveCount(3);

  await page.getByRole("link", { name: "설정" }).click();
  const morningTime = page.getByLabel("아침 알림 시간");
  await morningTime.fill("08:10");
  await expect(page.getByText("설정 저장됨")).toBeVisible();
  await page.getByRole("button", { name: "다크" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("아침 알림 시간")).toHaveValue("08:10");
  await expect(page.getByText("Database").locator(".." )).toContainText("데모 저장소");

  const overflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});
