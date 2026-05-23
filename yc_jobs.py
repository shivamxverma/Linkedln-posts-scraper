import argparse
import csv
import json
import logging
import re
import ssl
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi
from bs4 import BeautifulSoup


DEFAULT_SEARCH_URLS = [
    "https://www.ycombinator.com/jobs",
]

TITLE_INCLUDE_TERMS = {
    "backend",
    "back-end",
    "full stack",
    "fullstack",
    "software engineer",
    "software developer",
    "sde",
    "developer",
    "product engineer",
    "founding engineer",
}

TITLE_EXCLUDE_TERMS = {
    "senior",
    "staff",
    "principal",
    "lead",
    "manager",
    "architect",
    "director",
    "vp",
    "head",
    "ios",
    "android",
    "frontend",
    "react native",
    "design",
}

EMPLOYMENT_INCLUDE_TERMS = {
    "full-time",
    "full time",
    "internship",
    "intern",
    "contract",
}

ENTRY_LEVEL_INCLUDE_TERMS = {
    "0 years",
    "1 year",
    "1+ years",
    "any (new grads ok)",
    "new grads ok",
    "new grad",
    "entry level",
    "entry-level",
    "junior",
    "intern",
    "internship",
}

ENTRY_LEVEL_EXCLUDE_PATTERNS = [
    r"\b2\+?\s*years?\b",
    r"\b3\+?\s*years?\b",
    r"\b4\+?\s*years?\b",
    r"\b5\+?\s*years?\b",
    r"\b6\+?\s*years?\b",
    r"\b7\+?\s*years?\b",
    r"\b8\+?\s*years?\b",
    r"\b9\+?\s*years?\b",
    r"\b10\+?\s*years?\b",
]

OUTPUT_FIELDS = [
    "company",
    "batch",
    "title",
    "job_type",
    "role_track",
    "location",
    "experience_text",
    "entry_level_match_reason",
    "job_link",
    "source_page",
]

DEFAULT_ALLOWED_LOCATIONS = ["india"]
REMOTE_TERMS = {"remote", "work from home", "wfh", "anywhere"}


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def build_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


def fetch_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (YC Jobs Scraper)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=30, context=build_ssl_context()) as response:
        return response.read().decode("utf-8", errors="ignore")


def normalize_space(value: str) -> str:
    return " ".join((value or "").split())


def matches_any(text: str, terms: set[str]) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in terms)


def is_relevant_title(title: str) -> bool:
    lowered = title.lower()
    return matches_any(lowered, TITLE_INCLUDE_TERMS) and not matches_any(
        lowered, TITLE_EXCLUDE_TERMS
    )


def is_relevant_job_type(text: str) -> bool:
    return matches_any(text.lower(), EMPLOYMENT_INCLUDE_TERMS)


def extract_entry_level_reason(text: str) -> str:
    lowered = text.lower()
    for term in sorted(ENTRY_LEVEL_INCLUDE_TERMS):
        if term in lowered:
            return term
    return ""


def is_entry_level(text: str) -> tuple[bool, str]:
    lowered = text.lower()
    if any(re.search(pattern, lowered) for pattern in ENTRY_LEVEL_EXCLUDE_PATTERNS):
        return False, ""

    reason = extract_entry_level_reason(lowered)
    if reason:
        return True, reason

    return False, ""


def parse_yc_jobs_from_data_page(soup: BeautifulSoup, source_page: str) -> list[dict]:
    jobs = []
    seen_links = set()

    for node in soup.find_all(attrs={"data-page": True}):
        data_page = node.get("data-page")
        if not data_page:
            continue

        try:
            payload = json.loads(data_page)
        except json.JSONDecodeError:
            continue

        props = payload.get("props") or {}
        job_postings = props.get("jobPostings") or []
        if not isinstance(job_postings, list):
            continue

        for posting in job_postings:
            title = normalize_space(posting.get("title", ""))
            job_type = normalize_space(posting.get("type", ""))
            role_track = normalize_space(posting.get("roleSpecificType", ""))
            location = normalize_space(posting.get("location", ""))
            experience_text = normalize_space(posting.get("minExperience", ""))
            min_school_year = normalize_space(posting.get("minSchoolYear", ""))

            company = normalize_space(posting.get("companyName", ""))
            batch = normalize_space(posting.get("companyBatchName", ""))
            job_url = posting.get("url", "")
            if not job_url:
                continue
            job_link = (
                job_url
                if str(job_url).startswith("http")
                else f"https://www.ycombinator.com{job_url}"
            )
            if job_link in seen_links:
                continue

            combined_text = normalize_space(
                " ".join(
                    [
                        title,
                        job_type,
                        role_track,
                        location,
                        experience_text,
                        min_school_year,
                    ]
                )
            )
            if not is_relevant_title(title):
                continue
            if not is_relevant_job_type(combined_text):
                continue

            entry_level_ok, reason = is_entry_level(combined_text)
            if not entry_level_ok and min_school_year.lower() == "any":
                entry_level_ok, reason = True, "any"
            if not entry_level_ok:
                continue

            jobs.append(
                {
                    "company": company,
                    "batch": batch,
                    "title": title,
                    "job_type": job_type,
                    "role_track": role_track,
                    "location": location,
                    "experience_text": experience_text or min_school_year,
                    "entry_level_match_reason": reason,
                    "job_link": job_link,
                    "source_page": source_page,
                }
            )
            seen_links.add(job_link)

    return jobs


def parse_yc_jobs_page(page_html: str, source_page: str) -> list[dict]:
    soup = BeautifulSoup(page_html, "html.parser")
    data_page_jobs = parse_yc_jobs_from_data_page(soup, source_page)
    if data_page_jobs:
        return data_page_jobs

    jobs = []
    seen_links = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if "/companies/" not in href or "/jobs/" not in href:
            continue

        job_link = href if href.startswith("http") else f"https://www.ycombinator.com{href}"
        if job_link in seen_links:
            continue

        text = normalize_space(anchor.get_text(" ", strip=True))
        if not text:
            continue

        parts = [part.strip() for part in text.split("•")]
        if len(parts) < 5:
            continue

        title = normalize_space(parts[1] if len(parts) > 1 else "")
        job_type = normalize_space(parts[2] if len(parts) > 2 else "")
        role_track = normalize_space(parts[4] if len(parts) > 4 else "")
        location = normalize_space(parts[6] if len(parts) > 6 else "")

        company_and_batch = normalize_space(parts[0])
        company = company_and_batch
        batch = ""
        batch_match = re.search(r"\(([WS]\d+)\)", company_and_batch)
        if batch_match:
            batch = batch_match.group(1)
            company = normalize_space(company_and_batch.replace(f"({batch})", ""))

        experience_text = ""
        if len(parts) > 7:
            tail_text = " • ".join(parts[7:])
            exp_match = re.search(
                r"(Any \(new grads ok\)|\d+\+?\s*years?|new grads ok|new grad)",
                tail_text,
                flags=re.IGNORECASE,
            )
            if exp_match:
                experience_text = normalize_space(exp_match.group(1))

        combined_text = " ".join([title, job_type, role_track, location, experience_text, text])
        if not is_relevant_title(title):
            continue
        if not is_relevant_job_type(combined_text):
            continue

        entry_level_ok, reason = is_entry_level(combined_text)
        if not entry_level_ok:
            continue

        jobs.append(
            {
                "company": company,
                "batch": batch,
                "title": title,
                "job_type": job_type,
                "role_track": role_track,
                "location": location,
                "experience_text": experience_text,
                "entry_level_match_reason": reason,
                "job_link": job_link,
                "source_page": source_page,
            }
        )
        seen_links.add(job_link)

    return jobs


def dedupe_jobs(jobs: list[dict]) -> list[dict]:
    seen = set()
    unique_jobs = []
    for job in jobs:
        key = job.get("job_link")
        if not key or key in seen:
            continue
        seen.add(key)
        unique_jobs.append(job)
    return unique_jobs


def location_allowed(
    location: str,
    context_text: str,
    allowed_locations: list[str],
    include_remote: bool,
) -> bool:
    haystack = normalize_space(" ".join([location, context_text])).lower()
    if include_remote and any(term in haystack for term in REMOTE_TERMS):
        return True
    return any(location_term in haystack for location_term in allowed_locations)


def save_csv(rows: list[dict], output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    logging.info("Saved %s YC jobs to %s", len(rows), path)


def load_search_urls(args: argparse.Namespace) -> list[str]:
    urls = list(args.search_url or [])
    if args.search_urls_file:
        urls.extend(
            [
                line.strip()
                for line in Path(args.search_urls_file).read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        )
    if not urls:
        urls = DEFAULT_SEARCH_URLS
    return list(dict.fromkeys(urls))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape entry-level backend/full-stack/SDE jobs from YC Jobs."
    )
    parser.add_argument(
        "--search-url",
        action="append",
        help="Public YC jobs page URL to scrape. Repeat this flag for multiple pages.",
    )
    parser.add_argument(
        "--search-urls-file",
        help="Optional text file with one YC jobs page URL per line.",
    )
    parser.add_argument(
        "--output",
        default="yc_entry_level_jobs.csv",
        help="Output CSV file.",
    )
    parser.add_argument(
        "--location",
        action="append",
        help="Allowed location keyword. Repeat for multiple (default: india).",
    )
    parser.add_argument(
        "--no-remote",
        action="store_true",
        help="Exclude remote jobs.",
    )
    return parser.parse_args()


def main() -> None:
    configure_logging()
    args = parse_args()
    search_urls = load_search_urls(args)
    all_jobs = []
    for url in search_urls:
        logging.info("Fetching YC jobs from %s", url)
        try:
            page_html = fetch_text(url)
            all_jobs.extend(parse_yc_jobs_page(page_html, url))
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            logging.warning("Failed to fetch YC jobs from %s: %s", url, exc)

    allowed_locations = [
        normalize_space(value).lower()
        for value in (args.location or DEFAULT_ALLOWED_LOCATIONS)
        if normalize_space(value)
    ]
    include_remote = not args.no_remote
    location_filtered = [
        job
        for job in dedupe_jobs(all_jobs)
        if location_allowed(
            job.get("location", ""),
            " ".join(
                [
                    job.get("title", ""),
                    job.get("job_type", ""),
                    job.get("role_track", ""),
                    job.get("experience_text", ""),
                ]
            ),
            allowed_locations,
            include_remote,
        )
    ]
    save_csv(location_filtered, args.output)


if __name__ == "__main__":
    main()
