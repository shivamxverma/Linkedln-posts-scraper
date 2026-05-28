import type { Job, LinkedinRawJob } from "./types.js";

const LINKEDIN_BASE_URL = "https://www.linkedin.com";

function normalizeLinkedinUrl(href: string): string {
  if (href.startsWith("http")) {
    return href;
  }

  return `${LINKEDIN_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function deriveExternalId(applyUrl: string): string {
  const url = new URL(applyUrl);
  const currentJobId = url.searchParams.get("currentJobId");
  if (currentJobId) {
    return currentJobId;
  }

  const viewMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch?.[1]) {
    return viewMatch[1];
  }

  return applyUrl;
}

export function normalizeLinkedinJobs(rawJobs: LinkedinRawJob[]): Job[] {
  return rawJobs.map((raw) => {
    const applyUrl = normalizeLinkedinUrl(raw.href);

    return {
      source: "linkedin",
      externalId: deriveExternalId(applyUrl),
      title: raw.title.trim(),
      company: raw.company.trim(),
      location: raw.location?.trim(),
      applyUrl,
    };
  });
}
