import { SearchConfig } from "./types.js";

/**
 * Converts a string into a URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove special characters except spaces and hyphens
    .replace(/[\s_-]+/g, "-") // replace spaces and underscores with a single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Generates the target search URL on Wellfound.
 */
export function generateWellfoundUrl(config: SearchConfig): string {
  const roleSlug = slugify(config.role);
  const locationSlug = slugify(config.location);

  let url = `https://wellfound.com/role/l/${roleSlug}/${locationSlug}`;
  if (config.page && config.page > 1) {
    url += `?page=${config.page}`;
  }
  return url;
}
