import { prisma } from "./services/prisma.js";

async function main() {
  try {
    // Find the latest failed application
    const latestFailedApp = await prisma.application.findFirst({
      where: {
        status: "FAILED",
      },
      include: {
        job: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!latestFailedApp) {
      console.log("No failed applications found to retry!");
      return;
    }

    const { id, jobId, job } = latestFailedApp;
    console.log(`Found failed application: ${id} for Job: "${job.title}" at "${job.company}"`);
    console.log(`Retrying application by deleting the failed one first so we can queue a clean new retry...`);

    // Delete the failed application so the POST request doesn't block it
    await prisma.application.delete({
      where: { id },
    });

    console.log("Failed application deleted. Triggering Next.js API to enqueue the auto-apply...");

    // Send POST request to localhost:3001/api/v1/applications
    const response = await fetch("http://localhost:3001/api/v1/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    });

    const resJson = await response.json();
    console.log("API Response:", JSON.stringify(resJson, null, 2));

  } catch (error) {
    console.error("Failed to trigger autoapply:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
