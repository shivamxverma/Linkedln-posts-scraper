import type { LinkedinExperienceLevel, LinkedinSearchConfig, LinkedinWorkplaceType } from "./types.js";

const LINKEDIN_JOBS_SEARCH_URL = "https://www.linkedin.com/jobs/search/";

const EXPERIENCE_LEVEL_CODES: Record<LinkedinExperienceLevel, string> = {
  internship: "1",
  entry: "2",
  associate: "3",
  "mid-senior": "4",
  director: "5",
  executive: "6",
};

const WORKPLACE_TYPE_CODES: Record<LinkedinWorkplaceType, string> = {
  "on-site": "1",
  remote: "2",
  hybrid: "3",
};

export function buildLinkedinSearchUrl(config: LinkedinSearchConfig): string {
  if (config.url) {
    return config.url;
  }

  const url = new URL(LINKEDIN_JOBS_SEARCH_URL);
  url.searchParams.set("keywords", config.keywords);

  if (config.location) {
    url.searchParams.set("location", config.location);
  }

  if (config.experienceLevel) {
    url.searchParams.set("f_E", EXPERIENCE_LEVEL_CODES[config.experienceLevel]);
  }

  if (config.workplaceType) {
    url.searchParams.set("f_WT", WORKPLACE_TYPE_CODES[config.workplaceType]);
  }

  if (config.page && config.page > 1) {
    url.searchParams.set("start", String((config.page - 1) * 25));
  }

  return url.toString();
}
