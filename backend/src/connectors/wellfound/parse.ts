import * as cheerio from "cheerio";
import { RawJob } from "./types.js";

/**
 * Extracts raw job card listings from Wellfound HTML via Cheerio.
 * Wellfound typically groups listings under "Startup cards", where one company
 * lists one or more active roles. We parse these groups and individual job rows.
 */
export function parseWellfoundJobs(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const rawJobs: RawJob[] = [];

  // Selector 1: Wellfound Startup Cards (grouped by company)
  const startupCards = $('[data-test="StartupResultCard"], [class*="styles_result__"], [class*="styles_component__"]');

  console.log(`[Wellfound Parser] Found ${startupCards.length} potential company cards.`);

  if (startupCards.length > 0) {
    startupCards.each((_, card) => {
      const $card = $(card);

      // Extract Company Name
      // Look for data-test, headings, or class containing company/header/name
      let company = $card.find('[class*="styles_name__"], [class*="companyName"], h2, h3').first().text().trim();
      if (!company) {
        // Fallback to finding the company avatar or main title link
        company = $card.find('a[href*="/startup/"]').first().text().trim();
      }

      // If still not found, search for any bold text or fallback header
      if (!company) {
        company = $card.find("strong, b").first().text().trim() || "Unknown Company";
      }

      // Clean company name (sometimes contains logo alt texts or multiple lines)
      company = company.split("\n")[0].trim();

      // Find Job Listings under this company
      // Listings are usually elements containing "/jobs/" or having class matching jobListing/listing
      const jobRows = $card.find('[class*="styles_jobListing__"], [class*="jobListing"], [class*="styles_job__"], li:has(a[href*="/jobs/"])');

      jobRows.each((_, row) => {
        const $row = $(row);

        // Extract Title and URL
        const titleLink = $row.find('a[href*="/jobs/"], [class*="styles_title__"], a').first();
        const title = titleLink.text().trim();
        const jobUrl = titleLink.attr("href") || "";

        if (!title || !jobUrl) return; // Skip if no title or link

        // Extract Location and Salary
        // They are typically in metadata tags/divs or inline list items
        let location = "";
        let salary = "";

        // Check metadata items
        const metaItems = $row.find('[class*="styles_metadata__"], [class*="metadata"], span, div');
        metaItems.each((_, item) => {
          const text = $(item).text().trim();
          if (!text) return;

          // Check if it looks like salary (e.g. "$120k", "£50k", "€80k", "₹", "yearly")
          if (text.includes("$") || text.includes("£") || text.includes("€") || text.includes("₹") || /^[0-9]+k/i.test(text)) {
            // Keep the salary string
            if (!salary || text.length > salary.length) {
              salary = text;
            }
          } else if (
            text.toLowerCase().includes("remote") ||
            text.toLowerCase().includes("hybrid") ||
            text.toLowerCase().includes("on-site") ||
            (text.length > 2 && text.length < 50 && !text.includes("Apply") && !text.includes("Save") && !text.includes("days ago"))
          ) {
            // Probably location
            if (!location) {
              location = text;
            }
          }
        });

        // Clean up extracted metadata
        const cleanSalary = salary.replace(/\s+/g, " ").trim();
        const cleanLocation = location.replace(/\s+/g, " ").trim() || "Remote / Specified Inside";

        rawJobs.push({
          title,
          company,
          location: cleanLocation,
          salary: cleanSalary || undefined,
          jobUrl,
        });
      });
    });
  }

  // Fallback Selector 2: Direct job rows/cards if not grouped by company cards
  if (rawJobs.length === 0) {
    console.log("[Wellfound Parser] Startup cards yielded 0 jobs, attempting direct job card parsing...");
    
    // Look for all anchors pointing to jobs
    const directJobLinks = $('a[href*="/jobs/"]');
    directJobLinks.each((_, link) => {
      const $link = $(link);
      const title = $link.text().trim();
      const jobUrl = $link.attr("href") || "";

      // Ensure it is a valid job card link (not a small button, text, or main nav page)
      const isNavUrl =
        jobUrl.endsWith("/jobs/home") ||
        jobUrl.endsWith("/jobs") ||
        jobUrl.includes("/jobs/dashboard") ||
        jobUrl.includes("/jobs/saved") ||
        jobUrl.includes("/jobs/matches") ||
        jobUrl.includes("/jobs/messages") ||
        jobUrl.includes("/jobs/applications");

      if (title.length > 3 && !title.toLowerCase().includes("apply") && jobUrl && !isNavUrl) {
        // Look up DOM parents for company name
        const container = $link.closest("div, li, section");
        const company = container.find('[class*="company"], [class*="brand"]').first().text().trim() || "Unknown Company";
        
        rawJobs.push({
          title,
          company,
          location: "Remote / Multiple Locations",
          jobUrl,
        });
      }
    });
  }

  // Deduplicate results based on jobUrl
  const seenUrls = new Set<string>();
  const uniqueJobs = rawJobs.filter((job) => {
    if (!job.jobUrl) return false;
    const isDuplicate = seenUrls.has(job.jobUrl);
    seenUrls.add(job.jobUrl);
    return !isDuplicate;
  });

  console.log(`[Wellfound Parser] Successfully extracted ${uniqueJobs.length} unique jobs.`);
  return uniqueJobs;
}
