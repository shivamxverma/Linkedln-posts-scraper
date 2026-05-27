import { generateWellfoundUrl } from "./search.js";
import { parseWellfoundJobs } from "./parse.js";
import { normalizeWellfoundJobs } from "./normalize.js";
import { searchWellfoundJobs } from "./index.js";
import { upsertJobs } from "../../services/job-store.service.js";
import { prisma } from "../../services/prisma.js";

async function runTests() {
  console.log("=== STARTING WELLFOUND CONNECTOR ARCHITECTURE TESTS ===");

  // Test 1: URL generation & Slugification
  console.log("\n[Test 1] Testing Slugification & URL Generation...");
  const searchInput = { role: "Backend Engineer", location: "Bangalore, India" };
  const targetUrl = generateWellfoundUrl(searchInput);
  console.log(`Input: ${JSON.stringify(searchInput)}`);
  console.log(`Generated URL: ${targetUrl}`);
  const expectedUrl = "https://wellfound.com/role/l/backend-engineer/bangalore-india";
  if (targetUrl === expectedUrl) {
    console.log("✅ Test 1 Passed: URL slugification matches expectations!");
  } else {
    console.log(`❌ Test 1 Failed: Expected "${expectedUrl}", got "${targetUrl}"`);
  }

  // Test 2: Mock Parsing & Normalization
  console.log("\n[Test 2] Testing Parser and Normalizer with Mock HTML...");
  const mockHtml = `
    <html>
      <body>
        <!-- Mock Startup Card 1 -->
        <div data-test="StartupResultCard">
          <div class="styles_name__abc">MatX</div>
          <div>
            <!-- Job listing 1 -->
            <div class="styles_jobListing__xyz">
              <a href="/jobs/4265913-runtime-engineer" class="styles_title__123">Runtime Engineer</a>
              <span class="styles_metadata__789">Mountain View</span>
              <span class="styles_metadata__789">$120k – $475k</span>
            </div>
            <!-- Job listing 2 -->
            <div class="styles_jobListing__xyz">
              <a href="/jobs/4265914-infrastructure-engineer" class="styles_title__123">Infrastructure Engineer</a>
              <span class="styles_metadata__789">Remote</span>
              <span class="styles_metadata__789">$150k – $200k</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  const rawJobs = parseWellfoundJobs(mockHtml);
  console.log(`Extracted raw jobs: ${rawJobs.length}`);
  const normalizedJobs = normalizeWellfoundJobs(rawJobs);
  console.log("Normalized Jobs:", JSON.stringify(normalizedJobs, null, 2));

  if (normalizedJobs.length === 2) {
    console.log("✅ Test 2 Passed: Correctly extracted & normalized 2 mock listings!");
    const match = normalizedJobs[0];
    if (
      match.source === "wellfound" &&
      match.title === "Runtime Engineer" &&
      match.company === "MatX" &&
      match.location === "Mountain View" &&
      match.salary === "$120k – $475k" &&
      match.applyUrl === "/jobs/4265913-runtime-engineer"
    ) {
      console.log("✅ Test 2 Sub-Verify: Schema match matches exact requirements perfectly!");
    } else {
      console.log("❌ Test 2 Sub-Verify: Field mismatch detected.", match);
    }
  } else {
    console.log(`❌ Test 2 Failed: Expected 2 jobs, but got ${normalizedJobs.length}`);
  }

  // Test 3: Live end-to-end run
  console.log("\n[Test 3] Testing Live Pipeline End-to-End & Database Persistence...");
  console.log("Running searchWellfoundJobs for role: 'backend-engineer', location: 'bangalore'...");
  try {
    const jobs = await searchWellfoundJobs({ role: "backend-engineer", location: "bangalore" });
    console.log(`✅ Test 3 Complete: Scraped ${jobs.length} jobs dynamically via Playwright!`);
    if (jobs.length > 0) {
      console.log("Sample Dynamic Job:", JSON.stringify(jobs[0], null, 2));

      // Store/Persist in Neon PostgreSQL
      const storeResult = await upsertJobs(jobs);
      console.log(`[Neon Database] Store complete: ${storeResult.upserted} jobs written to database.`);

      // Query database count
      const dbCount = await prisma.job.count();
      console.log(`[Neon Database] Total jobs currently in Neon PostgreSQL: ${dbCount}`);
    } else {
      console.log("⚠️ Note: Playwright succeeded, but 0 jobs were extracted (page could be blank, protected, or no listings matching).");
    }
  } catch (error) {
    console.log("❌ Test 3 Failed:", error);
  } finally {
    // Gracefully disconnect Prisma client connection pool
    await prisma.$disconnect();
    console.log("[Neon Database] Disconnected pool cleanly.");
  }

  console.log("\n=== TEST RUN COMPLETED ===");
}

runTests();
