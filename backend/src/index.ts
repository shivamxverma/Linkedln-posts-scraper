import express from "express";
import { prisma } from "./services/prisma.js";
import { startFetchScheduler, triggerFetchJob } from "./scheduler/fetch.scheduler.js";
import { startCleanupScheduler, triggerCleanupJob } from "./scheduler/cleanup.scheduler.js";
import { resumeWorker } from "./queues/resume.worker.js";
import { applyWorker } from "./queues/apply.worker.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * Health Check & Status Endpoint
 * Returns statistics about the database and reports service health status.
 */
app.get("/health", async (req, res) => {
  try {
    // 1. Verify Database connectivity
    await prisma.$queryRaw`SELECT 1`;

    // 2. Query total job count in Neon Postgres
    const totalJobs = await prisma.job.count();
    const jobsBySource = await prisma.job.groupBy({
      by: ["source"],
      _count: {
        id: true,
      },
    });

    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        totalJobs,
        bySource: jobsBySource,
      },
      schedulers: {
        fetchInterval: "3 Hours",
        cleanupInterval: "12 Hours",
        purgingThreshold: "30 Days",
      },
    });
  } catch (error) {
    console.error("[Health Check] Database or check sequence failed:", error);
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Manual Trigger Endpoints (for testing & admin manual overrides)
 */
app.post("/jobs/trigger-crawl", async (req, res) => {
  try {
    console.log("[Admin API] Manual fetch crawl triggered via POST /jobs/trigger-crawl.");
    // Run asynchronously to avoid blocking the HTTP response
    triggerFetchJob();
    res.status(202).json({
      message: "Job fetching pipeline triggered in background.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger pipeline" });
  }
});

app.post("/jobs/trigger-cleanup", async (req, res) => {
  try {
    console.log("[Admin API] Manual stale job cleanup triggered via POST /jobs/trigger-cleanup.");
    // Run asynchronously to avoid blocking the HTTP response
    triggerCleanupJob();
    res.status(202).json({
      message: "Stale job database cleanup triggered in background.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger cleanup" });
  }
});

/**
 * Start Server & Schedulers
 */
async function bootstrap() {
  console.log("=== STARTING JOB AGGREGATOR ENGINE ===");

  try {
    // Start Express health checking server
    app.listen(PORT, () => {
      console.log(`[Express Health Server] Listening and active on port ${PORT}`);
      console.log(`[Express Health Server] Endpoint check: http://localhost:${PORT}/health`);
      console.log(`[Express Health Server] Initializing background workers...`);
      console.log(`[Express Health Server] Resume Worker active: ${resumeWorker.name}`);
      console.log(`[Express Health Server] Apply Worker active: ${applyWorker.name}`);
    });

    // Start fetching scheduler (Runs immediately on boot, then every 3 hours)
    // We pass `false` here as default so that it doesn't run crawlers instantly on local startup
    // unless explicitly configured, avoiding rate limits.
    const shouldRunFetchImmediately = process.env.RUN_CRAWLER_ON_BOOT === "true";
    startFetchScheduler(shouldRunFetchImmediately);

    // Start cleanup scheduler (Runs immediately on boot, then every 12 hours)
    startCleanupScheduler(true);

  } catch (error) {
    console.error("[Bootstrap Error] Critical system failure during bootstrapping:", error);
    process.exit(1);
  }
}

bootstrap();
