import { RawJob, Job } from "./types.js";

/**
 * Normalizes raw scraped job cards into our system's unified schema.
 */
export function normalizeWellfoundJobs(rawJobs: RawJob[]): Job[] {
  return rawJobs.map((raw) => {
    // Standardize URL: ensure relative urls have leading slash, or maintain absolute
    let applyUrl = raw.jobUrl.trim();
    if (!applyUrl.startsWith("http") && !applyUrl.startsWith("/")) {
      applyUrl = `/${applyUrl}`;
    }

    // Clean location strings (e.g. removing bullet points or extra whitespace)
    let location = raw.location.replace(/^[•\-\s]+/, "").trim();
    if (!location) {
      location = "Remote / Multiple Locations";
    }

    // Clean salary strings
    const salary = raw.salary ? raw.salary.trim() : undefined;

    return {
      source: "wellfound",
      title: raw.title.trim(),
      company: raw.company.trim(),
      location,
      salary,
      applyUrl,
    };
  });
}
