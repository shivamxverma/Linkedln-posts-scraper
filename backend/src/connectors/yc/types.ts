import type { Job as NormalizedJob } from "../types.js";

export interface YcSearchConfig {
  query?: string;
  role?: string;
  location?: string;
  page?: number;
  url?: string;
}

export type YcRawJob = Record<string, unknown>;

export type Job = NormalizedJob;
