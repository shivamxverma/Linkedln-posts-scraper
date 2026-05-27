import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as readline from "readline";
import * as path from "path";

chromium.use(stealthPlugin());

async function saveSession() {
  console.log("[Session Saver] Launching headed Chromium browser...");
  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  console.log("[Session Saver] Navigating to Wellfound login page...");
  await page.goto("https://wellfound.com/login");

  console.log("\n=======================================================");
  console.log("👉 ACTION REQUIRED:");
  console.log("1. In the browser window that popped up, log into Wellfound.");
  console.log("2. After you have completed login and see the jobs dashboard,");
  console.log("   come back to this terminal and press [ENTER].");
  console.log("=======================================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Press [ENTER] here once you have finished logging in...", async () => {
    const sessionPath = path.resolve(process.cwd(), "session.json");
    await context.storageState({ path: sessionPath });
    console.log(`\n✅ Success! Authentication cookies saved to: ${sessionPath}`);
    await browser.close();
    rl.close();
    process.exit(0);
  });
}

saveSession().catch((err) => {
  console.error("[Session Saver] Error launching save-session utility:", err);
  process.exit(1);
});
