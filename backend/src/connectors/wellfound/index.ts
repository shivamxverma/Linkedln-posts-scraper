import { SearchConfig, Job } from "./types.js";
import { generateWellfoundUrl } from "./search.js";
import { fetchWellfoundPage } from "./fetch.js";
import { parseWellfoundJobs } from "./parse.js";
import { normalizeWellfoundJobs } from "./normalize.js";

/**
 * Executes the entire ingestion + normalization pipeline for Wellfound jobs.
 * 
 * Flow:
 * Role + Location (SearchConfig)
 *         ↓
 * Generate URL (search)
 *         ↓
 * Fetch HTML (playwright)
 *         ↓
 * Cheerio Parsing (parse)
 *         ↓
 * Extract Job Cards
 *         ↓
 * Normalize (normalize)
 *         ↓
 * Return Job[]
 */
export async function searchWellfoundJobs(config: SearchConfig): Promise<Job[]> {
  try {
    console.log(`[Wellfound Pipeline] Starting job pipeline: ${JSON.stringify(config)}`);

    // 1. Generate URL
    const url = generateWellfoundUrl(config);
    console.log(`[Wellfound Pipeline] Target URL: ${url}`);

    // 2. Fetch HTML via Playwright
    const html = await fetchWellfoundPage(url);
    console.log(`[Wellfound Pipeline] HTML fetched successfully (${Math.round(html.length / 1024)} KB)`);

    // 3. Cheerio Parsing
    const rawJobs = parseWellfoundJobs(html);
    console.log(`[Wellfound Pipeline] Extracted ${rawJobs.length} raw jobs`);

    // 4. Normalize to unified schema
    const normalizedJobs = normalizeWellfoundJobs(rawJobs);
    console.log(`[Wellfound Pipeline] Standardized ${normalizedJobs.length} job objects`);

    return normalizedJobs;
  } catch (error) {
    console.error("[Wellfound Pipeline] Ingestion pipeline failed:", error);
    throw error;
  }
}

// Re-export all sub-modules for direct import if desired
export * from "./types.js";
export * from "./search.js";
export * from "./fetch.js";
export * from "./parse.js";
export * from "./normalize.js";
