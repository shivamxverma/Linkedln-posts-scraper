import { Queue } from "bullmq";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

console.log(`[Queue Setup] Configuring Redis connection to ${REDIS_HOST}:${REDIS_PORT}`);

export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null, // Critical configuration required by BullMQ
};

// Queue 1: Processes Master Resume Download + OpenAI tailoring + PDF compilation
export const resumeQueue = new Queue("resume-generation", {
  connection: redisConnectionOptions,
});

// Queue 2: Launches Playwright headed browser and executes auto apply flows
export const applyQueue = new Queue("auto-apply", {
  connection: redisConnectionOptions,
});

console.log("[Queue Setup] BullMQ Queues initialized successfully.");
