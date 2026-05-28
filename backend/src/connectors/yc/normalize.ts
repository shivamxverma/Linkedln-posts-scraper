import type { Job, YcRawJob } from "./types.js";

const YC_BASE_URL = "https://www.workatastartup.com";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumberOrString(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value);
  }

  return asString(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = asString(value) ?? asNumberOrString(value);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parts = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return firstString(record?.name, record?.city, record?.location);
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
  const url = asString(value);
  if (!url) {
    return undefined;
  }

  if (url.startsWith("http")) {
    return url;
  }

  return `${YC_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function deriveExternalId(raw: YcRawJob, applyUrl: string, title: string, company: string): string {
  const explicitId = firstString(raw.id, raw.jobId, raw.job_id, raw.uuid, raw.publicId);
  if (explicitId) {
    return explicitId;
  }

  const urlMatch = applyUrl.match(/\/jobs\/([^/?#]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  return `${company}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeSalary(raw: YcRawJob): string | undefined {
  const salary = firstString(raw.salaryRange, raw.salary_range, raw.salary, raw.compensation);
  if (salary) {
    return salary;
  }

  const min = firstString(raw.minSalary, raw.min_salary, raw.salaryMin);
  const max = firstString(raw.maxSalary, raw.max_salary, raw.salaryMax);
  if (min && max) {
    return `${min} - ${max}`;
  }

  return min ?? max;
}

export function normalizeYcJobs(rawJobs: YcRawJob[]): Job[] {
  return rawJobs.flatMap((raw) => {
    const company = asRecord(raw.company);
    const title = firstString(raw.title, raw.role, raw.name, raw.position);
    const companyName = firstString(raw.companyName, raw.company_name, company?.name, company?.companyName);
    const applyUrl = normalizeUrl(firstString(raw.applyUrl, raw.apply_url, raw.url, raw.path, raw.absoluteUrl));

    if (!title || !companyName || !applyUrl) {
      return [];
    }

    const location =
      firstString(raw.location, raw.locationName, raw.location_name, company?.location) ??
      joinStringArray(raw.locations) ??
      (raw.remote === true ? "Remote" : undefined);

    return [
      {
        source: "yc",
        externalId: deriveExternalId(raw, applyUrl, title, companyName),
        title,
        company: companyName,
        location,
        salary: normalizeSalary(raw),
        applyUrl,
        experienceLevel: firstString(raw.experienceLevel, raw.experience_level, raw.experience, raw.yearsExperience),
      },
    ];
  });
}
