import { Worker, Job as BullJob } from "bullmq";
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../services/prisma.js";
import { redisConnectionOptions } from "./queue.js";
import { LinkedinApplyAdapter } from "../connectors/adapters/linkedin-apply.adapter.js";
import { WellfoundApplyAdapter } from "../connectors/adapters/wellfound-apply.adapter.js";
import { ApplicationAdapter } from "../connectors/adapters/adapter.interface.js";

interface ApplyJobData {
  applicationId: string;
}

export const applyWorker = new Worker(
  "auto-apply",
  async (bullJob: BullJob<ApplyJobData>) => {
    const { applicationId } = bullJob.data;
    console.log(`[Apply Worker] Starting automated application for Application ID: ${applicationId}`);

    // 1. Fetch application, job, and generated resume details from DB
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        resumeVersion: true,
      },
    });

    if (!application) {
      throw new Error(`Application with ID ${applicationId} not found in database.`);
    }

    if (!application.resumeVersion) {
      throw new Error(`No optimized resume version is linked to this application.`);
    }

    const { job, resumeVersion } = application;

    if (!job.applyUrl) {
      throw new Error(`Job posting is missing an application URL (applyUrl).`);
    }

    // 2. Locate authenticated session cookies for the platform
    let sessionPath = "";
    if (job.source === "linkedin") {
      sessionPath = path.resolve(process.cwd(), "authentication", "linkedin-session.json");
    } else if (job.source === "wellfound") {
      sessionPath = path.resolve(process.cwd(), "session.json"); // wellfound saves cookies here
    }

    // If session file doesn't exist, throw a helpful user-facing error
    if (sessionPath && !fs.existsSync(sessionPath)) {
      throw new Error(
        `Authentication session cookies for platform "${job.source}" are missing. Please run the login utility in terminal first: ` +
        (job.source === "linkedin" ? "'pnpm run save-session:linkedin'" : "'pnpm save-session'")
      );
    }

    // 3. Update Application status to APPLYING
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "APPLYING" },
    });

    // 4. Launch Playwright headed browser (headed so user can watch, highly premium!)
    const usePersistentChrome = process.env.USE_PERSISTENT_CHROME === "true";
    const isHeadless = process.env.HEADLESS_APPLY === "true";
    let context: any;
    let browser: any;

    try {
      if (usePersistentChrome) {
        console.log("[Apply Worker] Attempting to launch using your actual Google Chrome session...");
        const userDataDir = process.env.CHROME_USER_DATA_DIR || "/Users/shivamverma/Library/Application Support/Google/Chrome";
        const profileDir = process.env.CHROME_PROFILE || "Default";
        
        try {
          context = await chromium.launchPersistentContext(userDataDir, {
            headless: isHeadless,
            channel: "chrome",
            args: [
              `--profile-directory=${profileDir}`,
              "--disable-blink-features=AutomationControlled"
            ],
            ignoreDefaultArgs: ["--enable-automation"],
            viewport: { width: 1366, height: 900 },
          });
        } catch (err) {
          console.error("[Apply Worker] Failed to launch persistent Chrome context:", err);
          throw new Error(
            "Could not launch using your actual Google Chrome session because Google Chrome is currently open. " +
            "Please CLOSE Google Chrome completely (Quit Chrome) and click 'Retry Application' again!"
          );
        }
      } else {
        const launchedBrowser = await chromium.launch({
          headless: isHeadless,
        });
        browser = launchedBrowser;

        if (sessionPath && fs.existsSync(sessionPath)) {
          console.log(`[Apply Worker] Loading session state from: ${sessionPath}`);
          context = await launchedBrowser.newContext({
            storageState: sessionPath,
            viewport: { width: 1366, height: 900 },
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          });
        } else {
          context = await launchedBrowser.newContext({
            viewport: { width: 1366, height: 900 },
          });
        }
      }

      const page = await context.newPage();

      // 5. Select the appropriate adapter based on URL & platform
      const adapters: ApplicationAdapter[] = [
        new LinkedinApplyAdapter(),
        new WellfoundApplyAdapter(),
      ];

      const activeAdapter = adapters.find((a) => a.canHandle(job.applyUrl!, job.source));
      if (!activeAdapter) {
        throw new Error(
          `No automation adapter found to handle job source: "${job.source}" and URL: "${job.applyUrl}".`
        );
      }

      // 6. Run the adapter apply flow
      await activeAdapter.apply({
        page,
        applicationId,
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.company,
        applyUrl: job.applyUrl,
        resumePdfPath: resumeVersion.pdfPath,
      });

      // 7. Success! Update Application & Job tracking states
      console.log(`[Apply Worker] Application completed successfully. Writing status to DB...`);
      
      const now = new Date();
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "APPLIED",
          appliedAt: now,
        },
      });

      // Update the Job object to also mirror this applied state in the explorer dashboard
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "Applied",
          appliedAt: now,
          platform: job.source,
          notes: `Automatically applied using tailored resume compiled by AI. Resume ID: ${resumeVersion.id}`,
        },
      });

      console.log(`[Apply Worker] Application finished! Application ID: ${applicationId}`);

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Apply Worker] Application failed for Application ID ${applicationId}:`, error);

      // Record failure inside application record
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "FAILED",
          errorMessage: errMsg,
        },
      });

      throw error;
    } finally {
      // Clean up and close Playwright
      await context?.close();
      if (browser) {
        await browser.close();
      }
      console.log("[Apply Worker] Playwright browser closed cleanly.");
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // Only launch one Playwright instance at a time to prevent CPU spikes and anti-bot blocks
  }
);

applyWorker.on("completed", (job) => {
  console.log(`[Apply Worker] Job ${job?.id} completed successfully.`);
});

applyWorker.on("failed", (job, err) => {
  console.error(`[Apply Worker] Job ${job?.id} failed:`, err);
});
