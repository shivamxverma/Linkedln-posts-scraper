import { chromium, type BrowserContext, type Route } from "playwright";
import { buildLinkedinSearchUrl } from "./search.js";
import { getLinkedinSessionPath, hasLinkedinSession } from "./session.js";
import type { LinkedinSearchConfig } from "./types.js";

const BLOCKED_RESOURCE_TYPES = new Set(["image", "font", "media"]);
const BLOCKED_HOST_PARTS = [
  "doubleclick",
  "googletagmanager",
  "google-analytics",
  "ads.linkedin",
  "px.ads.linkedin",
  "licdn.com/sc/h",
];

async function blockHeavyResources(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = request.url();

    if (
      BLOCKED_RESOURCE_TYPES.has(request.resourceType()) ||
      BLOCKED_HOST_PARTS.some((blockedHost) => url.includes(blockedHost))
    ) {
      await route.abort();
      return;
    }

    await route.continue();
  });
}

async function scrollSearchResults(page: Awaited<ReturnType<BrowserContext["newPage"]>>, scrollCount: number): Promise<void> {
  for (let index = 0; index < scrollCount; index++) {
    await page.evaluate(() => {
      const resultsList =
        document.querySelector(".jobs-search-results-list") ??
        document.querySelector(".jobs-search-results__list") ??
        document.scrollingElement ??
        document.documentElement;

      resultsList.scrollBy({ top: 900, behavior: "instant" });
    });
    await page.waitForTimeout(1200);
  }
}

export async function fetchRenderedLinkedinPage(
  configOrUrl: LinkedinSearchConfig | string,
  options: { scrollCount?: number; headless?: boolean } = {},
): Promise<string> {
  const url = typeof configOrUrl === "string" ? configOrUrl : buildLinkedinSearchUrl(configOrUrl);
  const sessionPath = getLinkedinSessionPath();

  if (!hasLinkedinSession()) {
    throw new Error(
      `[LinkedIn Fetcher] Missing authenticated session at ${sessionPath}. Run "pnpm save-session:linkedin" first.`,
    );
  }

  const browser = await chromium.launch({
    headless: options.headless ?? true,
  });

  try {
    const context = await browser.newContext({
      storageState: sessionPath,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    await blockHeavyResources(context);

    const page = await context.newPage();
    console.log(`[LinkedIn Fetcher] Opening search page: ${url}`);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => undefined);
    await page.waitForSelector(
      ".jobs-search-results__list-item, .job-card-container, .base-card, a[href*='/jobs/view/']",
      { timeout: 30000 },
    );

    await scrollSearchResults(page, options.scrollCount ?? 4);

    const html = await page.content();
    console.log(`[LinkedIn Fetcher] Rendered HTML captured (${Math.round(html.length / 1024)} KB).`);
    return html;
  } finally {
    await browser.close();
  }
}
