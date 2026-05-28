import * as cheerio from "cheerio";
import type { LinkedinRawJob } from "./types.js";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstText($element: cheerio.Cheerio<any>, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const text = cleanText($element.find(selector).first().text());
    if (text) {
      return text;
    }
  }

  return undefined;
}

function firstAttr(
  $element: cheerio.Cheerio<any>,
  selectors: string[],
  attribute: string,
): string | undefined {
  for (const selector of selectors) {
    const value = $element.find(selector).first().attr(attribute)?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function parseLinkedinJobs(html: string): LinkedinRawJob[] {
  const $ = cheerio.load(html);
  const rawJobs: LinkedinRawJob[] = [];

  const cards = $(
    [
      ".jobs-search-results__list-item",
      ".job-card-container",
      ".base-card",
      "li:has(a[href*='/jobs/view/'])",
      "div:has(> a[href*='/jobs/view/'])",
    ].join(", "),
  );

  cards.each((_, card) => {
    const $card = $(card);
    const href = firstAttr($card, ["a[href*='/jobs/view/']"], "href");
    const title =
      firstText($card, [
        ".job-card-list__title",
        ".job-card-container__link",
        ".base-search-card__title",
        "a[href*='/jobs/view/']",
      ]) ?? "";
    const company =
      firstText($card, [
        ".job-card-container__primary-description",
        ".base-search-card__subtitle",
        ".job-search-card__subtitle-link",
        "[data-test-job-card-company-name]",
      ]) ?? "";
    const location = firstText($card, [
      ".job-card-container__metadata-item",
      ".job-search-card__location",
      ".base-search-card__metadata",
    ]);
    const listedAt = firstText($card, ["time", ".job-card-container__listed-time"]);

    if (!href || !title || !company) {
      return;
    }

    rawJobs.push({
      title,
      company,
      location,
      href,
      listedAt,
    });
  });

  const seen = new Set<string>();
  const uniqueJobs = rawJobs.filter((job) => {
    const key = job.href;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  console.log(`[LinkedIn Parser] Extracted ${uniqueJobs.length} unique visible jobs.`);
  return uniqueJobs;
}
