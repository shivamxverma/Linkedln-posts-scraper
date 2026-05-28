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

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function scrollSearchResults(page: Awaited<ReturnType<BrowserContext["newPage"]>>, scrollCount: number): Promise<void> {
  console.log(`[LinkedIn Fetcher] Beginning human-simulated page scanning (${scrollCount} scrolls requested)...`);
  
  // Human pause: scan the initial viewport
  await page.waitForTimeout(getRandomDelay(2000, 4500));

  for (let index = 0; index < scrollCount; index++) {
    try {
      // Simulate real mouse movements to random coordinates to mimic user attention/movement
      const x = getRandomDelay(100, 800);
      const y = getRandomDelay(200, 600);
      await page.mouse.move(x, y, { steps: getRandomDelay(5, 12) }).catch(() => undefined);

      // Scroll in 2 to 3 smaller, smooth human-like steps instead of one large instant jump
      const steps = getRandomDelay(2, 3);
      for (let s = 0; s < steps; s++) {
        const scrollAmount = getRandomDelay(200, 380);
        await page.evaluate((amount) => {
          const resultsList =
            document.querySelector(".jobs-search-results-list") ??
            document.querySelector(".jobs-search-results__list") ??
            document.scrollingElement ??
            document.documentElement;

          if (resultsList) {
            resultsList.scrollBy({ top: amount, behavior: "smooth" });
          }
        }, scrollAmount);
        
        // Brief realistic pause between mini-scroll steps
        await page.waitForTimeout(getRandomDelay(600, 1100));
      }
    } catch (err: any) {
      const currentUrl = page.url();
      if (
        currentUrl.includes("login") ||
        currentUrl.includes("checkpoint") ||
        currentUrl.includes("signup") ||
        currentUrl.includes("authwall")
      ) {
        throw new Error(`[LinkedIn Fetcher] Session is invalid, expired, or blocked. Redirected to: ${currentUrl}`);
      }
      if (err.message.includes("Execution context was destroyed") || err.message.includes("navigation")) {
        console.warn(`[LinkedIn Fetcher] Scrolling interrupted by context destruction, retrying... Current URL: ${currentUrl}`);
        await page.waitForTimeout(getRandomDelay(2000, 3000));
        continue;
      }
      throw err;
    }
    
    // Deep random pause between listing batches to mimic reading cards
    await page.waitForTimeout(getRandomDelay(2800, 5200));
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
