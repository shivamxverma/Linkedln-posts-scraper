import { loadCookieHeader } from "../../services/session-manager.js";
import { generateYcJobsUrl } from "./search.js";
import type { YcSearchConfig } from "./types.js";

const YC_COOKIE_CANDIDATES = [
  "authentication/raw-cookies-yc.json",
  "backend/authentication/raw-cookies-yc.json",
  "authentication/session-yc.json",
  "backend/authentication/session-yc.json",
];

export async function fetchYcJobsPage(config: YcSearchConfig = {}): Promise<string> {
  const url = generateYcJobsUrl(config);
  const cookie = loadCookieHeader({
    cookieFileCandidates: YC_COOKIE_CANDIDATES,
    domainIncludes: "workatastartup.com",
  });

  console.log(`[YC Fetcher] Requesting authenticated jobs page: ${url}`);

  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      cookie,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`[YC Fetcher] Failed with HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}
