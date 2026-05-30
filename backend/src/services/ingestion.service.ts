import { prisma } from "./prisma.js";
import type { Job } from "../connectors/types.js";
import { isIndiaJob } from "../shared/location-filter.js";

/**
 * Ingestion Service
 * Handles upserting standardized job listings from various sources (LinkedIn, YC, Wellfound).
 * Keeps record of when listings were last seen so that inactive/stale listings can be cleaned up later.
 */
export async function ingestJobs(jobs: Job[]): Promise<{ upserted: number; failed: number }> {
  console.log(`[Ingestion Service] Commencing ingestion of ${jobs.length} jobs in Neon PostgreSQL...`);

  let upserted = 0;
  let failed = 0;

  for (const job of jobs) {
    if (!isIndiaJob(job.location)) {
      console.log(`[Ingestion Service] Skipping job listing "${job.title}" at "${job.company}" because location "${job.location}" is not in India.`);
      continue;
    }

    try {
      await prisma.job.upsert({
        where: {
          source_externalId: {
            source: job.source,
            externalId: job.externalId,
          },
        },
        update: {
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
          externalId: job.externalId,
          lastSeenAt: new Date(),
        },
        create: {
          applyUrl: job.applyUrl,
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
          externalId: job.externalId,
          lastSeenAt: new Date(),
        },
      });
      upserted++;
    } catch (error) {
      console.error(`[Ingestion Service] Failed to ingest job listing "${job.title}" at "${job.company}":`, error);
      failed++;
    }
  }

  console.log(`[Ingestion Service] Ingestion cycle complete. Upserted: ${upserted}, Failed: ${failed}`);
  return { upserted, failed };
}
