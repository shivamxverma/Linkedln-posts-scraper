import * as fs from "fs";
import * as path from "path";

type RawCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  expires?: number;
};

type CookieStore = RawCookie[] | { cookies?: RawCookie[] };

function resolveFirstExistingPath(candidates: string[]): string {
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existingPath) {
    throw new Error(`No cookie file found. Checked: ${candidates.join(", ")}`);
  }
  return existingPath;
}

function readCookieStore(filePath: string): RawCookie[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content) as CookieStore;

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed.cookies)) {
    return parsed.cookies;
  }

  throw new Error(`Cookie file at ${filePath} must be a cookie array or Playwright storage state.`);
}

export function loadCookieHeader(options: {
  cookieFileCandidates: string[];
  domainIncludes?: string;
}): string {
  const cookiePath = resolveFirstExistingPath(options.cookieFileCandidates.map((candidate) => path.resolve(candidate)));
  const nowSeconds = Date.now() / 1000;

  const cookies = readCookieStore(cookiePath).filter((cookie) => {
    if (!cookie.name || typeof cookie.value !== "string") {
      return false;
    }

    const expires = cookie.expirationDate ?? cookie.expires;
    if (expires && expires > 0 && expires < nowSeconds) {
      return false;
    }

    if (!options.domainIncludes) {
      return true;
    }

    return cookie.domain?.includes(options.domainIncludes) ?? true;
  });

  if (cookies.length === 0) {
    throw new Error(`No usable cookies found in ${cookiePath}.`);
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
