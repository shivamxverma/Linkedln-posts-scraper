import * as fs from "fs";
import * as path from "path";

type RawCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expirationDate?: number;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

function mapSameSite(value: string | undefined): "Strict" | "Lax" | "None" {
  const normalized = value?.toLowerCase();

  if (normalized === "strict") return "Strict";
  if (normalized === "none" || normalized === "no_restriction") return "None";
  return "Lax";
}

function importLinkedinCookies() {
  const primaryPath = path.resolve(process.cwd(), "authentication/raw-cookies-linkedin.json");
  const fallbackPath = path.resolve(process.cwd(), "authentication/raw-cookies-linkedln.json");
  const outputPath = path.resolve(process.cwd(), "authentication/linkedin-session.json");

  let rawPath = primaryPath;
  if (!fs.existsSync(primaryPath)) {
    if (fs.existsSync(fallbackPath)) {
      rawPath = fallbackPath;
    } else {
      console.error(`[LinkedIn Cookies] Missing cookie export: ${primaryPath}`);
      console.log("Export LinkedIn cookies from your existing Chrome session and save them there.");
      process.exit(1);
    }
  }

  const rawFilename = path.basename(rawPath);
  const rawCookies = JSON.parse(fs.readFileSync(rawPath, "utf-8")) as RawCookie[];
  if (!Array.isArray(rawCookies)) {
    throw new Error(`${rawFilename} must be an array of cookies.`);
  }

  const cookies = rawCookies
    .filter((cookie) => cookie.domain?.includes("linkedin.com"))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path ?? "/",
      expires: cookie.expirationDate ?? cookie.expires ?? Math.floor(Date.now() / 1000) + 86400 * 30,
      httpOnly: cookie.httpOnly ?? false,
      secure: cookie.secure ?? true,
      sameSite: mapSameSite(cookie.sameSite),
    }));

  if (cookies.length === 0) {
    throw new Error(`No linkedin.com cookies found in ${rawFilename}.`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ cookies, origins: [] }, null, 2), "utf-8");

  console.log(`[LinkedIn Cookies] Imported ${cookies.length} cookies.`);
  console.log(`[LinkedIn Cookies] Saved Playwright session to: ${outputPath}`);
}

importLinkedinCookies();
