import { Queue } from "bullmq";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

const globalForQueue = globalThis as unknown as {
  resumeQueue?: Queue;
};

export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null, // Critical configuration required by BullMQ
};

export const resumeQueue =
  globalForQueue.resumeQueue ??
  new Queue("resume-generation", {
    connection: redisConnectionOptions,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.resumeQueue = resumeQueue;
}
