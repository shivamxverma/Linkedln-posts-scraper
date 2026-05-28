import type { JobConnector } from "../types.js";
import { fetchYcJobsPage } from "./fetch.js";
import { normalizeYcJobs } from "./normalize.js";
import { parseYcJobs } from "./parse.js";
import type { Job, YcSearchConfig } from "./types.js";

export async function searchYcJobs(config: YcSearchConfig = {}): Promise<Job[]> {
  try {
    console.log(`[YC Pipeline] Starting job pipeline: ${JSON.stringify(config)}`);

    const html = await fetchYcJobsPage(config);
    console.log(`[YC Pipeline] HTML fetched successfully (${Math.round(html.length / 1024)} KB)`);

    const rawJobs = parseYcJobs(html);
    console.log(`[YC Pipeline] Extracted ${rawJobs.length} raw jobs`);

    const normalizedJobs = normalizeYcJobs(rawJobs);
    console.log(`[YC Pipeline] Standardized ${normalizedJobs.length} job objects`);

    return normalizedJobs;
  } catch (error) {
    console.error("[YC Pipeline] Ingestion pipeline failed:", error);
    throw error;
  }
}

export const ycConnector: JobConnector<YcSearchConfig> = {
  source: "yc",
  search: searchYcJobs,
};

export * from "./types.js";
export * from "./search.js";
export * from "./fetch.js";
export * from "./parse.js";
export * from "./normalize.js";
