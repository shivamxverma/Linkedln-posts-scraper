import { prisma } from "./prisma.js";
export interface StoreJobInput {
  source: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  applyUrl: string;
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
    try {
      await prisma.job.upsert({
        where: {
          applyUrl: job.applyUrl,
        },
        update: {
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
        },
        create: {
          applyUrl: job.applyUrl,
          title: job.title,
          company: job.company,
          location: job.location ?? "Remote / Multiple Locations",
          salary: job.salary,
          source: job.source,
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
