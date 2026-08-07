import { expect, test } from "@playwright/test";

test("daily reading, reflection, archive, insights and settings", async ({ page }) => {
  const navigationDurations: number[] = [];
  page.on("console", (message) => {
    try {
      const entry = JSON.parse(message.text()) as { stage?: string; elapsedMs?: number };
      if (entry.stage === "navigation_completed" && typeof entry.elapsedMs === "number") {
        navigationDurations.push(entry.elapsedMs);
      }
    } catch {
      // Ignore ordinary browser logs.
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /의 뉴스/ })).toBeVisible();
  await expect(page.locator(".progress-meta")).toContainText(/0 \/ [5-9]|0 \/ 10/);

  for (const category of ["정치", "사회", "과학", "IT·정보", "경제"]) {
    await expect(page.getByRole("heading", { name: category, exact: true })).toBeVisible();
  }

  const firstCard = page.locator(".news-card").first();
  const secondCard = page.locator(".news-card").nth(1);
  await firstCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(firstCard.getByRole("heading", { name: "무슨 일이 있었나" })).toBeVisible();
  await expect(firstCard.locator(".source-block a").first()).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator(".progress-meta")).toContainText(/1 \/ [5-9]|1 \/ 10/);

  await firstCard.locator(".source-block").scrollIntoViewIfNeeded();
  await secondCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(firstCard.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await expect(secondCard.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const openedCardTop = await secondCard.evaluate((card) => card.getBoundingClientRect().top);
  expect(openedCardTop).toBeGreaterThanOrEqual(0);
  expect(openedCardTop).toBeLessThanOrEqual(48);

  const collapsedPreviews = page.locator(".news-card[data-expanded='false'] .card-one-line, .news-card[data-expanded='false'] .card-why");
  for (let index = 0; index < await collapsedPreviews.count(); index += 1) {
    const preview = collapsedPreviews.nth(index);
    await expect(preview).not.toHaveText(/\.\.\.|…\s*$/);
    expect(await preview.evaluate((element) => getComputedStyle(element).webkitLineClamp)).toBe("none");
  }

  const reflection = "이 변화의 비용이 누구에게 먼저 돌아가는지 더 확인하고 싶다.";
  const secondReflection = secondCard.getByPlaceholder("두세 문장으로 생각을 남겨보세요.");
  await secondReflection.fill(reflection);
  await expect(secondReflection).toBeFocused();
  const scrollBeforeTyping = await page.evaluate(() => window.scrollY);
  await secondReflection.press("End");
  await secondReflection.type(" ");
  const scrollAfterTyping = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterTyping - scrollBeforeTyping)).toBeLessThanOrEqual(2);
  await secondReflection.fill(reflection);
  await firstCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await secondCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(secondCard.getByPlaceholder("두세 문장으로 생각을 남겨보세요.")).toHaveValue(reflection);
  await page.waitForTimeout(800);
  await expect(secondCard.getByText("저장됨")).toBeVisible();

  await page.reload();
  const reloadedSecondCard = page.locator(".news-card").nth(1);
  await reloadedSecondCard.getByRole("button", { name: /자세히 읽기/ }).click();
  await expect(reloadedSecondCard.getByPlaceholder("두세 문장으로 생각을 남겨보세요.")).toHaveValue(reflection);
  await expect(page.locator(".progress-meta")).toContainText(/2 \/ [5-9]|2 \/ 10/);

  const summaries = page.locator(".news-card__summary");
  for (let index = 0; index < await summaries.count(); index += 1) {
    await summaries.nth(index).click();
  }
  await expect(page.getByText("오늘의 핵심을 모두 읽었습니다")).toBeVisible();
  await expect(page.getByText("오늘의 핵심을 모두 읽었습니다")).toBeHidden({ timeout: 5000 });

  await page.reload();
  await expect(page.locator(".completion-celebration")).toHaveCount(0);

  await page.getByRole("link", { name: "지난 뉴스" }).click();
  await expect(page.getByRole("heading", { name: "지난 뉴스" })).toBeVisible();
  await expect(page.locator(".archive-row")).toContainText(/\d+개 핵심/);
  await page.locator(".archive-row").first().click();
  await expect(page).toHaveURL(/\/archive\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator(".news-card").first()).toBeVisible();
  await expect(page.locator(".completion-celebration")).toHaveCount(0);

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
  expect(navigationDurations.length).toBeGreaterThanOrEqual(3);
  console.log(`navigation-latency-ms ${JSON.stringify(navigationDurations)}`);
});
