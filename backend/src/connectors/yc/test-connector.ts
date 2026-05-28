import { normalizeYcJobs } from "./normalize.js";
import { parseYcJobs } from "./parse.js";
import { searchYcJobs } from "./index.js";

async function runTests() {
  console.log("=== STARTING YC CONNECTOR ARCHITECTURE TESTS ===");

  const mockHydration = {
    component: "Jobs/Index",
    props: {
      jobPostings: [
        {
          id: 78968,
          title: "Founding Backend Engineer",
          companyName: "Acme AI",
          location: "San Francisco, CA / Remote",
          salaryRange: "$120K - $180K",
          applyUrl: "/jobs/78968-founding-backend-engineer",
          experienceLevel: "3+ years",
        },
      ],
    },
  };

  const mockHtml = `<div id="app" data-page='${JSON.stringify(mockHydration)}'></div>`;
  const rawJobs = parseYcJobs(mockHtml);
  const normalizedJobs = normalizeYcJobs(rawJobs);

  console.log("Normalized Jobs:", JSON.stringify(normalizedJobs, null, 2));

  if (
    normalizedJobs.length === 1 &&
    normalizedJobs[0].source === "yc" &&
    normalizedJobs[0].externalId === "78968" &&
    normalizedJobs[0].applyUrl === "https://www.workatastartup.com/jobs/78968-founding-backend-engineer"
  ) {
    console.log("✅ Mock parser + normalizer test passed.");
  } else {
    console.log("❌ Mock parser + normalizer test failed.");
  }

  if (process.env.YC_LIVE_TEST === "true") {
    const { upsertJobs } = await import("../../services/job-store.service.js");
    const { prisma } = await import("../../services/prisma.js");

    try {
      const liveJobs = await searchYcJobs({ role: "backend" });
      console.log(`Live YC connector returned ${liveJobs.length} jobs.`);
      
      if (liveJobs.length > 0) {
        console.log("Sample:", JSON.stringify(liveJobs[0], null, 2));
        
        // Store/Persist in Neon PostgreSQL
        const storeResult = await upsertJobs(liveJobs);
        console.log(`[Neon Database] Store complete: ${storeResult.upserted} YC jobs written/updated in database.`);

        // Query database count
        const dbCount = await prisma.job.count();
        console.log(`[Neon Database] Total jobs currently in Neon PostgreSQL: ${dbCount}`);
      } else {
        console.log("⚠️ Live fetch returned 0 jobs. Check cookies or search query.");
      }
    } catch (error) {
      console.error("❌ Live YC integration test failed:", error);
    } finally {
      await prisma.$disconnect();
      console.log("[Neon Database] Disconnected pool cleanly.");
    }
  } else {
    console.log("Skipping live YC request. Set YC_LIVE_TEST=true to run it.");
  }
}

runTests();
