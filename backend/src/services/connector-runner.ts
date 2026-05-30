import { searchLinkedinJobs } from "../connectors/linkedin/index.js";
import { searchYcJobs } from "../connectors/yc/index.js";
import { searchWellfoundJobs } from "../connectors/wellfound/index.js";
import { ingestJobs } from "./ingestion.service.js";
import type { Job } from "../connectors/types.js";

/**
 * Connector Runner
 * Responsibilities:
 * 1. Gather configuration parameters for all target connectors.
 * 2. Execute scraping connectors in a sequential, safe manner.
 * 3. Consolidate results into a unified array.
 * 4. Trigger the Ingestion Service to store and update listings in PostgreSQL.
 */
export async function runAllConnectors(): Promise<{ totalFetched: number; upserted: number; failed: number }> {
  console.log("[Connector Runner] Executing active job aggregation connectors...");

  const allJobs: Job[] = [];

  // 1. Run YC Jobs Connector
  try {
    console.log("[Connector Runner] Launching YC Jobs Connector...");
    const ycJobs = await searchYcJobs({
      query: "Software Engineer",
      location: "India",
    });
    allJobs.push(...ycJobs);
    console.log(`[Connector Runner] YC Jobs Connector successfully returned ${ycJobs.length} normalized listings.`);
  } catch (error) {
    console.error("[Connector Runner] YC Jobs Connector execution failed:", error);
  }

  // 2. Run Wellfound Jobs Connector
  try {
    console.log("[Connector Runner] Launching Wellfound Jobs Connector...");
    const wellfoundJobs = await searchWellfoundJobs({
      role: "software-engineer",
      location: "India",
    });
    allJobs.push(...wellfoundJobs);
    console.log(`[Connector Runner] Wellfound Jobs Connector successfully returned ${wellfoundJobs.length} normalized listings.`);
  } catch (error) {
    console.error("[Connector Runner] Wellfound Jobs Connector execution failed:", error);
  }

  // 3. Run LinkedIn Jobs Connector
  try {
    console.log("[Connector Runner] Launching LinkedIn Jobs Connector...");
    const linkedinJobs = await searchLinkedinJobs({
      keywords: "Software Engineer",
      location: "India",
      experienceLevel: "entry",
      workplaceType: "remote",
    });
    allJobs.push(...linkedinJobs);
    console.log(`[Connector Runner] LinkedIn Jobs Connector successfully returned ${linkedinJobs.length} normalized listings.`);
  } catch (error) {
    console.error("[Connector Runner] LinkedIn Jobs Connector execution failed (check session cookies or site changes):", error);
  }

  console.log(`\n[Connector Runner] Finished scanning. Consolidated list contains ${allJobs.length} jobs.`);

  if (allJobs.length > 0) {
    const result = await ingestJobs(allJobs);
    console.log(`[Connector Runner] Ingestion phase finished. Saved/Updated: ${result.upserted}, Failures: ${result.failed}`);
    return {
      totalFetched: allJobs.length,
      upserted: result.upserted,
      failed: result.failed,
    };
  } else {
    console.log("[Connector Runner] Zero jobs were fetched in this crawl cycle. Skipping database ingestion.");
    return {
      totalFetched: 0,
      upserted: 0,
      failed: 0,
    };
  }
}
