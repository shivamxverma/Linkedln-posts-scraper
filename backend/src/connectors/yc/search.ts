import type { YcSearchConfig } from "./types.js";

const YC_JOBS_URL = "https://www.workatastartup.com/jobs";

export function generateYcJobsUrl(config: YcSearchConfig = {}): string {
  if (config.url) {
    return config.url;
  }

  const url = new URL(YC_JOBS_URL);
  const query = config.query ?? config.role;

  if (query) {
    url.searchParams.set("q", query);
  }

  if (config.location) {
    url.searchParams.set("location", config.location);
  }

  if (config.page && config.page > 1) {
    url.searchParams.set("page", String(config.page));
  }

  return url.toString();
}
