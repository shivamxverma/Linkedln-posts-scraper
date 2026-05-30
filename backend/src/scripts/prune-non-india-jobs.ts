import { prisma } from "../services/prisma.js";
import { isIndiaJob } from "../shared/location-filter.js";

async function main() {
  console.log("=== DB PRUNING IN PROGRESS ===");
  try {
    const allJobs = await prisma.job.findMany({
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
      },
    });

    console.log(`Analyzing ${allJobs.length} jobs in database...`);

    const jobsToDelete = allJobs.filter((job) => !isIndiaJob(job.location));

    console.log(`Found ${jobsToDelete.length} jobs to delete (not in India).`);

    if (jobsToDelete.length > 0) {
      const idsToDelete = jobsToDelete.map((job) => job.id);
      
      console.log("Starting deletion of non-India jobs...");
      const deleteResult = await prisma.job.deleteMany({
        where: {
          id: {
            in: idsToDelete,
          },
        },
      });

      console.log(`Successfully deleted ${deleteResult.count} non-India job listings from database.`);
    } else {
      console.log("No jobs require pruning.");
    }

    const remainingJobsCount = await prisma.job.count();
    console.log(`Remaining jobs in database: ${remainingJobsCount}`);

  } catch (error) {
    console.error("Pruning script encountered an error:", error);
  } finally {
    await prisma.$disconnect();
    console.log("Database disconnected.");
  }
}

main();
