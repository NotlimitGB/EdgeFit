// Optional investigation harness: Playwright is intentionally not an app dependency.
// SNOWDEX_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/verify-catalog-mobile.mjs http://127.0.0.1:3036
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
const modulePath = process.env.SNOWDEX_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Supply an independently installed Playwright module.");
const { webkit } = await import(pathToFileURL(modulePath).href);
const origin = new URL(process.argv[2]).origin;
const browser = await webkit.launch({ headless: true });
try {
  for (const [width, height] of [[390, 844], [430, 932], [768, 1024], [1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true,
      isMobile: width < 1440, serviceWorkers: "block" });
    const blocked = [], errors = [], allowed = [];
    await context.route("**/*", (route) => {
      const request = route.request(), url = new URL(request.url());
      if (!["GET", "HEAD"].includes(request.method()) || url.origin !== origin ||
        /^\/(api|go|internal)(\/|$)/u.test(url.pathname) || /^\/_vercel\/(insights|speed-insights)(\/|$)/u.test(url.pathname)) {
        blocked.push({ method: request.method(), path: url.pathname });
        return route.abort();
      }
      allowed.push({ method: request.method(), path: url.pathname });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/catalog`, { waitUntil: "domcontentloaded" });
    const brand = page.getByRole("button", { name: "Бренд Все бренды" });
    await brand.waitFor();
    await brand.tap();
    const brandGroup = page.getByRole("group", { name: "Бренд", exact: true });
    const firstBrand = brandGroup.getByRole("checkbox").first();
    await firstBrand.tap(); assert.equal(await firstBrand.isChecked(), true);
    await firstBrand.tap(); assert.equal(await firstBrand.isChecked(), false);
    const options = brandGroup.locator('[class*="multiSelectOptions"]');
    if (await options.count()) {
      await options.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const lastBrand = brandGroup.getByRole("checkbox").last();
      await lastBrand.tap(); assert.equal(await lastBrand.isChecked(), true);
      await lastBrand.tap(); assert.equal(await lastBrand.isChecked(), false);
      assert.equal(await brand.getAttribute("aria-expanded"), "true");
    }
    await page.locator("h2").first().tap();
    assert.equal(await brand.getAttribute("aria-expanded"), "false");
    const summary = page.locator("summary").filter({ hasText: "Стиль, уровень и характеристики" });
    const details = summary.locator("..");
    await summary.tap(); assert.equal(await details.evaluate((element) => element.open), true);
    const style = page.getByRole("button", { name: /^Стиль /u });
    const skill = page.getByRole("button", { name: /^Уровень /u });
    await style.tap(); await skill.tap();
    assert.equal(await style.getAttribute("aria-expanded"), "false");
    assert.equal(await skill.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    for (const name of ["Стиль", "Уровень", "Линейка", "Форма"]) {
      const trigger = page.getByRole("button", { name: new RegExp(`^${name} `, "u") });
      await trigger.tap();
      const checkbox = page.getByRole("group", { name, exact: true }).getByRole("checkbox").first();
      await checkbox.tap(); assert.equal(await checkbox.isChecked(), true);
      await checkbox.tap(); assert.equal(await checkbox.isChecked(), false);
      assert.equal(await details.evaluate((element) => element.open), true);
      await trigger.tap();
    }
    await summary.tap(); assert.equal(await details.evaluate((element) => element.open), false);
    await page.getByRole("button", { name: "wide", exact: true }).tap();
    await page.getByRole("button", { name: /Сбросить/u }).tap();
    const count = () => page.locator("article").count();
    assert.equal(await count(), 24);
    for (const expected of [48, 72, 96]) {
      await page.getByRole("button", { name: /Показать ещё/u }).tap();
      assert.equal(await count(), expected);
    }
    const search = page.getByRole("searchbox", { name: /Поиск/u });
    await search.tap(); await search.fill("fixture"); await search.fill("");
    await page.getByRole("combobox", { name: /Сортировка/u }).tap();
    await page.getByRole("combobox", { name: /Сортировка/u }).selectOption("price-desc");
    await page.getByRole("button", { name: /Сбросить/u }).tap();
    await page.goto(`${origin}/catalog?style=park`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Стиль park/u }).waitFor();
    assert.equal(await details.evaluate((element) => element.open), true);
    await summary.tap(); await brand.tap();
    await page.keyboard.press("Escape");
    assert.equal(await brand.getAttribute("aria-expanded"), "false");
    assert.equal(await details.evaluate((element) => element.open), false);
    await page.evaluate(() => { history.pushState({}, "", "/catalog?style=freeride");
      dispatchEvent(new PopStateEvent("popstate")); });
    await page.getByRole("button", { name: /Стиль freeride/u }).waitFor();
    assert.equal(await details.evaluate((element) => element.open), true);
    await page.goBack();
    await page.getByRole("button", { name: /Стиль park/u }).waitFor();
    await page.goForward();
    await page.getByRole("button", { name: /Стиль freeride/u }).waitFor();
    await style.tap();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    assert.equal(allowed.some((request) => !["GET", "HEAD"].includes(request.method)), false);
    const screenshot = join(tmpdir(), `snowdex-036b-webkit-${width}.png`);
    await page.screenshot({ path: screenshot });
    console.log(JSON.stringify({ width, height, engine: "webkit", status: "PASS", screenshot,
      allowedReadRequests: allowed.length, blockedRequests: blocked.length, errors }));
    await context.close();
  }
} finally { await browser.close(); }
