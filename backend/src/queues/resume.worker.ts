import { Worker, Job as BullJob } from "bullmq";
import * as path from "path";
import { chromium } from "playwright";
import { prisma } from "../services/prisma.js";
import { ResumeFetcherService } from "../services/resume-fetcher.service.js";
import { ResumeOptimizerService } from "../services/resume-optimizer.service.js";
import { ResumeGeneratorService } from "../services/resume-generator.service.js";
import { applyQueue, redisConnectionOptions } from "./queue.js";

interface ResumeJobData {
  applicationId: string;
}

/**
 * Smart scraper that launches headless Playwright to fetch the full JD
 * from the apply URL when it is not already cached in the database.
 */
async function fetchJobDescription(applyUrl: string): Promise<string> {
  console.log(`[Resume Worker] Scraper triggered: Fetching full JD from ${applyUrl}...`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Allow dynamic JS components to hydrate
    await page.waitForTimeout(3000);

    const selectors = [
      ".jobs-description__content",
      "#job-details",
      ".show-more-less-html__markup",
      ".jobs-box__html-content",
      "[data-test='job-description']",
      ".job-description",
      "article",
      "main"
    ];

    for (const selector of selectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0 && await element.isVisible()) {
        const text = await element.innerText();
        if (text && text.trim().length > 150) {
          console.log(`[Resume Worker] Found JD using selector: "${selector}" (${text.trim().length} chars).`);
          return text.trim();
        }
      }
    }

    // Direct text fallback
    const bodyText = await page.locator("body").innerText();
    console.log(`[Resume Worker] Scraper fallback: Using body text content (${bodyText.length} chars).`);
    return bodyText.trim();
  } finally {
    await browser.close();
  }
}

export const resumeWorker = new Worker(
  "resume-generation",
  async (bullJob: BullJob<ResumeJobData>) => {
    const { applicationId } = bullJob.data;
    console.log(`[Resume Worker] Starting resume generation job for Application ID: ${applicationId}`);

    // 1. Fetch the application and associated job from DB
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });

    if (!application) {
      throw new Error(`Application with ID ${applicationId} not found in database.`);
    }

    try {
      // 2. Update status to GENERATING_RESUME
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "GENERATING_RESUME" },
      });

      // 3. Resolve and cache the full Job Description
      let jobDescription = application.job.description;
      if (!jobDescription || jobDescription.trim().length < 50) {
        if (application.job.applyUrl) {
          try {
            console.log(`[Resume Worker] Full JD missing in DB. Fetching live from: ${application.job.applyUrl}`);
            jobDescription = await fetchJobDescription(application.job.applyUrl);
            
            // Cache it in the database for the future
            await prisma.job.update({
              where: { id: application.jobId },
              data: { description: jobDescription },
            });
            console.log(`[Resume Worker] Cached fetched JD in Neon PostgreSQL.`);
          } catch (e) {
            console.error(`[Resume Worker] Failed to scrape job description:`, e);
            // Fallback to title/company name
            jobDescription = `${application.job.title} at ${application.job.company}`;
          }
        } else {
          jobDescription = `${application.job.title} at ${application.job.company}`;
        }
      }

      // 4. Fetch Master Resume
      console.log("[Resume Worker] Step 1/4: Fetching master resume...");
      const fetcher = new ResumeFetcherService();
      const { text: masterResumeText } = await fetcher.fetchMasterResume();

      // 5. Tailor Resume via OpenAI
      console.log("[Resume Worker] Step 2/4: Optimizing resume via OpenAI...");
      const optimizer = new ResumeOptimizerService();
      const tailoredData = await optimizer.optimize(
        masterResumeText,
        application.job.title,
        application.job.company,
        jobDescription!
      );

      // 5. Generate LaTeX and PDF Files
      console.log("[Resume Worker] Step 3/4: Generating LaTeX and PDF files...");
      const generator = new ResumeGeneratorService();
      const outputDir = path.resolve(process.cwd(), "storage", "resumes", applicationId);
      const { pdfPath, latexPath, compileMethod } = await generator.generateResumeFiles(
        tailoredData,
        outputDir
      );

      console.log(`[Resume Worker] Files created successfully (Method: ${compileMethod}). PDF Path: ${pdfPath}`);

      // 6. Record ResumeVersion in database
      console.log("[Resume Worker] Step 4/4: Saving resume version to database...");
      const resumeVersion = await prisma.resumeVersion.create({
        data: {
          applicationId,
          jobId: application.jobId,
          pdfPath,
          latexPath,
        },
      });

      // 7. Update Application status to READY_TO_APPLY
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "READY_TO_APPLY",
          resumeVersionId: resumeVersion.id,
        },
      });

      console.log(`[Resume Worker] Resume tailored successfully. Enqueuing Auto Apply job...`);

      // 8. Queue the Auto Apply task
      await applyQueue.add(
        "auto-apply-task",
        { applicationId },
        {
          attempts: 1, // Let Playwright run once, can manual retry if needed
          removeOnComplete: true,
        }
      );

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Resume Worker] CRITICAL FAILURE for Application ID: ${applicationId}:`, error);

      // Update Application status to FAILED and record error
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "FAILED",
          errorMessage: errMsg,
        },
      });

      throw error; // Let BullMQ mark the job as failed in Redis
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // Process one resume at a time to prevent LLM rate limits
  }
);

resumeWorker.on("completed", (job) => {
  console.log(`[Resume Worker] Job ${job?.id} completed successfully.`);
});

resumeWorker.on("failed", (job, err) => {
  console.error(`[Resume Worker] Job ${job?.id} failed:`, err);
});
