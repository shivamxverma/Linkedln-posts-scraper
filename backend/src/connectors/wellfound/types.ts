import type { Job as NormalizedJob } from "../types.js";

export interface SearchConfig {
  role: string;
  location: string;
  page?: number;
}

export interface RawJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  jobUrl: string;
}

export type Job = NormalizedJob;
