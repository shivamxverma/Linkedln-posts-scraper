import type { Job as NormalizedJob } from "../types.js";

export type LinkedinExperienceLevel =
  | "internship"
  | "entry"
  | "associate"
  | "mid-senior"
  | "director"
  | "executive";

export type LinkedinWorkplaceType = "on-site" | "remote" | "hybrid";

export interface LinkedinSearchConfig {
  keywords: string;
  location?: string;
  experienceLevel?: LinkedinExperienceLevel;
  workplaceType?: LinkedinWorkplaceType;
  page?: number;
  url?: string;
}

export interface LinkedinRawJob {
  title: string;
  company: string;
  location?: string;
  href: string;
  listedAt?: string;
}

export type Job = NormalizedJob;
