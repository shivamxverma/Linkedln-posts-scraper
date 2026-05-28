import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const LINKEDIN_SESSION_PATH = "authentication/linkedin-session.json";

export function getLinkedinSessionPath(): string {
  return path.resolve(process.cwd(), LINKEDIN_SESSION_PATH);
}

export function hasLinkedinSession(): boolean {
  return fs.existsSync(getLinkedinSessionPath());
}

export async function saveLinkedinSession(): Promise<void> {
  const sessionPath = getLinkedinSessionPath();
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    console.log("[LinkedIn Session] Opening LinkedIn login page.");
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("[LinkedIn Session] Log in manually in the browser window.");
    console.log("[LinkedIn Session] After login, open https://www.linkedin.com/feed/ or https://www.linkedin.com/jobs/.");

    const rl = readline.createInterface({ input, output });
    await rl.question("[LinkedIn Session] Press Enter here once LinkedIn shows you as logged in...");
    rl.close();

    await context.storageState({ path: sessionPath });
    console.log(`[LinkedIn Session] Saved authenticated session to: ${sessionPath}`);
  } finally {
    await browser.close();
  }
}
