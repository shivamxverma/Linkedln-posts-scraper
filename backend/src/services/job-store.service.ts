import { prisma } from "./prisma.js";
import { isIndiaJob } from "../shared/location-filter.js";

export interface StoreJobInput {
  source: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  applyUrl: string;
  externalId?: string;
}

/**
 * Stores a list of standardized scraped jobs in the PostgreSQL database.
 * Performs a safe upsert using 'applyUrl' as the unique key to prevent duplicate listings.
 */
export async function upsertJobs(jobs: StoreJobInput[]): Promise<{ upserted: number; failed: number }> {
  console.log(`[Job Store] Commencing storage of ${jobs.length} jobs in Neon PostgreSQL...`);

  let upserted = 0;
  let failed = 0;

  for (const job of jobs) {
    if (!isIndiaJob(job.location)) {
      console.log(`[Job Store] Skipping job listing "${job.title}" at "${job.company}" because location "${job.location}" is not in India.`);
      continue;
    }

    try {
      const derivedId = job.externalId ?? 
        job.applyUrl.split("/").pop()?.split("?")[0] ?? 
        `legacy-${job.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      await prisma.job.upsert({
        where: {
          source_externalId: {
            source: job.source,
            externalId: derivedId,
          },
        },
        update: {
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
          externalId: derivedId,
        },
        create: {
          applyUrl: job.applyUrl,
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
          externalId: derivedId,
        },
      });
      upserted++;
    } catch (error) {
      console.error(`[Job Store] Failed to upsert job listing "${job.title}" at "${job.company}":`, error);
      failed++;
    }
  }

  console.log(`[Job Store] Storage sequence finished. Saved/Updated: ${upserted}, Failed: ${failed}`);
  return { upserted, failed };
}
