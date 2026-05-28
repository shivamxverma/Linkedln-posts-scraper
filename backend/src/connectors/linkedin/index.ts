import type { JobConnector } from "../types.js";
import { fetchRenderedLinkedinPage } from "./fetch.js";
import { normalizeLinkedinJobs } from "./normalize.js";
import { parseLinkedinJobs } from "./parse.js";
import type { Job, LinkedinSearchConfig } from "./types.js";

export async function searchLinkedinJobs(config: LinkedinSearchConfig): Promise<Job[]> {
  try {
    console.log(`[LinkedIn Pipeline] Starting job pipeline: ${JSON.stringify(config)}`);

    const html = await fetchRenderedLinkedinPage(config);
    const rawJobs = parseLinkedinJobs(html);
    const normalizedJobs = normalizeLinkedinJobs(rawJobs);

    console.log(`[LinkedIn Pipeline] Standardized ${normalizedJobs.length} job objects.`);
    return normalizedJobs;
  } catch (error) {
    console.error("[LinkedIn Pipeline] Ingestion pipeline failed:", error);
    throw error;
  }
}

export const linkedinConnector: JobConnector<LinkedinSearchConfig> = {
  source: "linkedin",
  search: searchLinkedinJobs,
};

export * from "./types.js";
export * from "./search.js";
export * from "./session.js";
export * from "./fetch.js";
export * from "./parse.js";
export * from "./normalize.js";
