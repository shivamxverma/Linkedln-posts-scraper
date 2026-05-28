import * as cheerio from "cheerio";
import type { YcRawJob } from "./types.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function findJobPostings(value: unknown): YcRawJob[] {
  if (Array.isArray(value)) {
    return value.flatMap(findJobPostings);
  }

  if (!isRecord(value)) {
    return [];
  }

  const direct = value.jobPostings ?? value.jobs;
  if (Array.isArray(direct)) {
    return direct.filter(isRecord);
  }

  if (isRecord(direct) && Array.isArray(direct.data)) {
    return direct.data.filter(isRecord);
  }

  return Object.values(value).flatMap(findJobPostings);
}

function extractDataPageJson(html: string): unknown {
  const $ = cheerio.load(html);
  const dataPage = $("[data-page]").first().attr("data-page");

  if (dataPage) {
    return JSON.parse(dataPage);
  }

  const match = html.match(/data-page="([^"]+)"/);
  if (match?.[1]) {
    return JSON.parse(decodeHtmlAttribute(match[1]));
  }

  throw new Error("[YC Parser] Could not find data-page hydration JSON.");
}

export function parseYcJobs(html: string): YcRawJob[] {
  const pageJson = extractDataPageJson(html);
  const jobs = findJobPostings(pageJson);

  console.log(`[YC Parser] Extracted ${jobs.length} jobs from hydration state.`);
  return jobs;
}
