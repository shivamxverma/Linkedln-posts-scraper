import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

import * as fs from "fs";
import * as path from "path";

// Hook the stealth plugin into the chromium instance
chromium.use(stealthPlugin());

/**
 * Launches a headless browser to fetch the raw HTML of a given Wellfound URL.
 */
export async function fetchWellfoundPage(url: string): Promise<string> {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const sessionPath = path.resolve(process.cwd(), "session.json");
    const hasSession = fs.existsSync(sessionPath);

    const contextOptions: any = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    };

    if (hasSession) {
      console.log(`[Wellfound Fetcher] Loading active session cookies from: ${sessionPath}`);
      contextOptions.storageState = sessionPath;
    } else {
      console.log("[Wellfound Fetcher] ⚠️ Warning: No 'session.json' found. Running anonymously (susceptible to DataDome blocks).");
    }

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();

    // Set additional browser headers for realistic requests
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    console.log(`[Wellfound Fetcher] Navigating to: ${url}`);

    // Go to the search page, waiting for the document layout to be loaded
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait brief duration for dynamic elements to initialize
    await page.waitForTimeout(3000);

    const actualUrl = page.url();
    const title = await page.title();
    console.log(`[Wellfound Fetcher] Actual Loaded URL: ${actualUrl}`);
    console.log(`[Wellfound Fetcher] Page Title: ${title}`);

    // Get the dynamic page content
    const html = await page.content();
    return html;
  } catch (error) {
    console.error("[Wellfound Fetcher] Error fetching page:", error);
    throw error;
  } finally {
    await browser.close();
    console.log("[Wellfound Fetcher] Headless browser closed.");
  }
}
