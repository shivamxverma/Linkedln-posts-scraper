import { prisma } from "@/lib/prisma";
import type { Job } from "@/types/job";

export async function listJobs(): Promise<Job[]> {
  const jobs = await prisma.job.findMany({
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  return jobs.map((job) => ({
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }));
}
