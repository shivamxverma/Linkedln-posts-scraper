import argparse
import csv
import json
import logging
import re
import ssl
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi


TITLE_INCLUDE_TERMS = {
    "backend",
    "back-end",
    "full stack",
    "fullstack",
    "software engineer",
    "software developer",
    "sde",
    "developer",
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
}

EMPLOYMENT_INCLUDE_TERMS = {
    "full time",
    "full-time",
    "intern",
    "internship",
    "apprentice",
}

ENTRY_LEVEL_INCLUDE_TERMS = {
    "0-1",
    "0 to 1",
    "0–1",
    "1 year",
    "1+ year",
    "new grad",
    "entry level",
    "entry-level",
    "fresher",
    "graduate",
    "intern",
    "internship",
    "junior",
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
    "source",
    "board_token",
    "title",
    "location",
    "employment_type",
    "experience_summary",
    "entry_level_match_reason",
    "job_link",
]


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def build_ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


def fetch_json(url: str) -> dict | list:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Job-Scraper Script)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=30, context=build_ssl_context()) as response:
        return json.load(response)


def normalize_space(value: str) -> str:
    return " ".join((value or "").split())


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return normalize_space(text)


def matches_any(text: str, terms: set[str]) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in terms)


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


def is_relevant_title(title: str) -> bool:
    lowered = title.lower()
    return matches_any(lowered, TITLE_INCLUDE_TERMS) and not matches_any(
        lowered, TITLE_EXCLUDE_TERMS
    )


def is_relevant_employment_type(title: str, employment_type: str, description: str) -> bool:
    combined = " ".join([title, employment_type, description]).lower()
    return matches_any(combined, EMPLOYMENT_INCLUDE_TERMS)


def filter_job(job: dict) -> dict | None:
    title = normalize_space(job.get("title", ""))
    employment_type = normalize_space(job.get("employment_type", ""))
    description = normalize_space(job.get("description", ""))

    if not title or not is_relevant_title(title):
        return None

    if not is_relevant_employment_type(title, employment_type, description):
        return None

    entry_level_ok, reason = is_entry_level(" ".join([title, employment_type, description]))
    if not entry_level_ok:
        return None

    filtered = dict(job)
    filtered["entry_level_match_reason"] = reason
    return filtered


def dedupe_jobs(jobs: list[dict]) -> list[dict]:
    seen = set()
    unique_jobs = []
    for job in jobs:
        key = job.get("job_link") or f'{job.get("company", "")}:{job.get("title", "")}'
        if not key or key in seen:
            continue
        seen.add(key)
        unique_jobs.append(job)
    return unique_jobs


def fetch_greenhouse_jobs(company: str, board_token: str) -> list[dict]:
    payload = fetch_json(f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs")
    jobs = []

    for item in payload.get("jobs", []):
        jobs.append(
            {
                "company": company,
                "source": "greenhouse",
                "board_token": board_token,
                "title": normalize_space(item.get("title", "")),
                "location": normalize_space((item.get("location") or {}).get("name", "")),
                "employment_type": "",
                "description": "",
                "experience_summary": "",
                "job_link": item.get("absolute_url", ""),
            }
        )

    return jobs


def fetch_lever_jobs(company: str, board_token: str) -> list[dict]:
    payload = fetch_json(f"https://api.lever.co/v0/postings/{board_token}?mode=json")
    jobs = []

    for item in payload:
        categories = item.get("categories") or {}
        description_plain = strip_html(item.get("descriptionPlain", "") or item.get("description", ""))
        additional_plain = strip_html(item.get("additionalPlain", "") or item.get("additional", ""))
        lists_plain = strip_html(item.get("listsPlain", "") or "")
        combined_description = normalize_space(
            " ".join([description_plain, additional_plain, lists_plain])
        )

        jobs.append(
            {
                "company": company,
                "source": "lever",
                "board_token": board_token,
                "title": normalize_space(item.get("text", "")),
                "location": normalize_space(categories.get("location", "")),
                "employment_type": normalize_space(
                    " ".join(
                        part
                        for part in [
                            categories.get("commitment", ""),
                            categories.get("team", ""),
                            categories.get("level", ""),
                        ]
                        if part
                    )
                ),
                "description": combined_description,
                "experience_summary": combined_description[:220],
                "job_link": item.get("hostedUrl", "") or item.get("applyUrl", ""),
            }
        )

    return jobs


def fetch_greenhouse_job_details(job: dict) -> dict:
    detail_url = job.get("job_link", "").rstrip("/") + "?gh_jid"
    if not job.get("job_link"):
        return job

    try:
        html_text = fetch_text(job["job_link"])
    except (HTTPError, URLError, TimeoutError, ValueError):
        return job

    cleaned_text = strip_html(html_text)
    job["description"] = cleaned_text
    job["experience_summary"] = cleaned_text[:220]
    return job


def fetch_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Job-Scraper Script)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urlopen(request, timeout=30, context=build_ssl_context()) as response:
        return response.read().decode("utf-8", errors="ignore")


def enrich_jobs(jobs: list[dict]) -> list[dict]:
    enriched_jobs = []
    for job in jobs:
        if job.get("source") == "greenhouse":
            enriched_jobs.append(fetch_greenhouse_job_details(job))
        else:
            enriched_jobs.append(job)
    return enriched_jobs


def load_sources(path: str) -> list[dict]:
    sources = []
    with Path(path).open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        required_fields = {"company", "source", "board_token"}
        if not required_fields.issubset(reader.fieldnames or []):
            raise ValueError(
                f"Source file must include columns: {', '.join(sorted(required_fields))}"
            )
        for row in reader:
            source = {key: normalize_space(value) for key, value in row.items()}
            if source["company"] and source["source"] and source["board_token"]:
                sources.append(source)
    return sources


def collect_jobs(sources: list[dict]) -> list[dict]:
    fetchers: dict[str, Callable[[str, str], list[dict]]] = {
        "greenhouse": fetch_greenhouse_jobs,
        "lever": fetch_lever_jobs,
    }

    all_jobs = []
    for source in sources:
        company = source["company"]
        source_type = source["source"].lower()
        board_token = source["board_token"]

        fetcher = fetchers.get(source_type)
        if not fetcher:
            logging.warning("Skipping unsupported source type '%s' for %s", source_type, company)
            continue

        logging.info("Fetching jobs for %s from %s", company, source_type)
        try:
            jobs = fetcher(company, board_token)
            all_jobs.extend(jobs)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            logging.warning("Failed to fetch jobs for %s: %s", company, exc)

    return all_jobs


def save_csv(rows: list[dict], output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(
            [
                {field: row.get(field, "") for field in OUTPUT_FIELDS}
                for row in rows
            ]
        )
    logging.info("Saved %s jobs to %s", len(rows), path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect entry-level backend/full-stack/SDE jobs from ATS boards."
    )
    parser.add_argument(
        "--sources-file",
        default="job_sources.csv",
        help="CSV file with columns: company, source, board_token",
    )
    parser.add_argument(
        "--output",
        default="entry_level_jobs.csv",
        help="Output CSV path for filtered jobs.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Optional max number of filtered jobs to save.",
    )
    return parser.parse_args()


def main() -> None:
    configure_logging()
    args = parse_args()
    sources = load_sources(args.sources_file)
    raw_jobs = collect_jobs(sources)
    enriched_jobs = enrich_jobs(raw_jobs)
    filtered_jobs = [job for job in (filter_job(job) for job in enriched_jobs) if job]
    unique_jobs = dedupe_jobs(filtered_jobs)

    if args.limit is not None:
        unique_jobs = unique_jobs[: args.limit]

    save_csv(unique_jobs, args.output)


if __name__ == "__main__":
    main()
