import argparse
import csv
import logging
import random
import re
import time
from pathlib import Path
from urllib.parse import urljoin

from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchWindowException,
    SessionNotCreatedException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


DEFAULT_SEARCH_URLS = [
    "https://wellfound.com/role/backend-engineer",
    "https://wellfound.com/role/software-engineer",
    "https://wellfound.com/role/developer",
    "https://wellfound.com/jobs",
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
    "react",
    "salesforce",
}

EMPLOYMENT_INCLUDE_TERMS = {
    "full time",
    "full-time",
    "intern",
    "internship",
}

ENTRY_LEVEL_INCLUDE_TERMS = {
    "0 years of exp",
    "0 year of exp",
    "1 year of exp",
    "0-1",
    "0 to 1",
    "0–1",
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
    r"\b2\+?\s*years?\s+of\s+exp\b",
    r"\b3\+?\s*years?\s+of\s+exp\b",
    r"\b4\+?\s*years?\s+of\s+exp\b",
    r"\b5\+?\s*years?\s+of\s+exp\b",
    r"\b6\+?\s*years?\s+of\s+exp\b",
    r"\b7\+?\s*years?\s+of\s+exp\b",
    r"\b8\+?\s*years?\s+of\s+exp\b",
    r"\b9\+?\s*years?\s+of\s+exp\b",
    r"\b10\+?\s*years?\s+of\s+exp\b",
    r"\b2\+?\s*years?\b",
    r"\b3\+?\s*years?\b",
    r"\b4\+?\s*years?\b",
    r"\b5\+?\s*years?\b",
]

NOISE_LINES = {
    "save",
    "apply",
    "actively hiring",
}

OUTPUT_FIELDS = [
    "title",
    "company",
    "employment_type",
    "location",
    "experience_text",
    "entry_level_match_reason",
    "source_page",
    "job_link",
    "card_text",
]

DEFAULT_ALLOWED_LOCATIONS = ["india"]
REMOTE_TERMS = {"remote", "work from home", "wfh", "anywhere"}


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


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


def is_relevant_employment(card_text: str) -> bool:
    return matches_any(card_text.lower(), EMPLOYMENT_INCLUDE_TERMS)


def resolve_chrome_binary() -> str | None:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


def resolve_profile_options(profile_dir: str | None) -> tuple[str | None, str | None]:
    if not profile_dir:
        return None, None

    profile_path = Path(profile_dir).expanduser().resolve()
    if (
        profile_path.name in {"Default", "Guest Profile"}
        or profile_path.name.startswith("Profile ")
    ) and profile_path.parent.exists():
        return str(profile_path.parent), profile_path.name

    return str(profile_path), None


def build_driver(headless: bool = False, profile_dir: str | None = None) -> webdriver.Chrome:
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--remote-allow-origins=*")

    chrome_binary = resolve_chrome_binary()
    if chrome_binary:
        options.binary_location = chrome_binary

    user_data_dir, profile_name = resolve_profile_options(profile_dir)
    if user_data_dir:
        options.add_argument(f"--user-data-dir={user_data_dir}")
    if profile_name:
        options.add_argument(f"--profile-directory={profile_name}")

    try:
        return webdriver.Chrome(service=Service(), options=options)
    except SessionNotCreatedException as exc:
        raise RuntimeError(
            "Chrome could not be started by Selenium. Close all Chrome windows or use a"
            " dedicated folder like /Users/shivamverma/Desktop/Job-Scraper/wellfound-chrome-data."
            f" Original error: {exc.msg}"
        ) from exc


def wait_for_page(driver: webdriver.Chrome) -> None:
    WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    time.sleep(random.uniform(2.5, 4.0))


def scroll_page(driver: webdriver.Chrome, scrolls: int) -> None:
    last_height = driver.execute_script("return document.body.scrollHeight")
    for _ in range(scrolls):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(random.uniform(2.0, 3.5))
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height


def maybe_close_modal(driver: webdriver.Chrome) -> None:
    selectors = [
        'button[aria-label="Close"]',
        'button[data-testid="close-modal"]',
        'button[title="Close"]',
    ]
    for selector in selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            for element in elements[:2]:
                if element.is_displayed():
                    element.click()
                    time.sleep(0.5)
                    return
        except WebDriverException:
            continue


def collect_raw_cards(driver: webdriver.Chrome) -> list[dict]:
    script = """
const items = [];
const seen = new Set();
const anchors = document.querySelectorAll('a[href*="/jobs/"]');
for (const anchor of anchors) {
  const title = (anchor.innerText || "").trim();
  const href = anchor.href || "";
  if (!title || !href || seen.has(href)) continue;
  let node = anchor;
  let cardText = "";
  while (node && node !== document.body) {
    const text = (node.innerText || "").trim();
    if (text && text.includes(title) && text.length > title.length + 10 && text.length < 1800) {
      cardText = text;
      break;
    }
    node = node.parentElement;
  }
  items.push({title, href, cardText: cardText || title});
  seen.add(href);
}
return items;
"""
    return driver.execute_script(script)


def clean_lines(card_text: str) -> list[str]:
    lines = []
    for raw_line in card_text.splitlines():
        line = normalize_space(raw_line)
        if not line:
            continue
        if line.lower() in NOISE_LINES:
            continue
        lines.append(line)
    return lines


def split_title_and_employment(text: str) -> tuple[str, str]:
    employment_keywords = ["Full-time", "Full time", "Internship", "Intern"]
    for keyword in employment_keywords:
        if keyword in text:
            title, _, employment = text.partition(keyword)
            return normalize_space(title), normalize_space(keyword + employment)
    return normalize_space(text), ""


def looks_like_company_line(line: str, title: str) -> bool:
    lowered = line.lower()
    if line == title:
        return False
    if "year" in lowered or "exp" in lowered:
        return False
    if "remote" in lowered or "office" in lowered:
        return False
    if "$" in line or "₹" in line or "€" in line:
        return False
    if matches_any(lowered, {"full-time", "full time", "intern", "internship"}):
        return False
    return True


def extract_job_from_card(raw_card: dict, source_page: str) -> dict | None:
    title = normalize_space(raw_card.get("title", ""))
    href = raw_card.get("href", "")
    card_text = normalize_space(raw_card.get("cardText", ""))
    if not title or not href:
        return None

    lines = clean_lines(raw_card.get("cardText", ""))
    title_line = next((line for line in lines if title in line), title)
    parsed_title, inline_employment = split_title_and_employment(title_line)
    if parsed_title:
        title = parsed_title

    company = ""
    location = ""
    employment_type = inline_employment
    experience_text = ""

    title_index = lines.index(title_line) if title_line in lines else -1
    if title_index > 0:
        for line in reversed(lines[:title_index]):
            if looks_like_company_line(line, title):
                company = line
                break

    for line in lines[title_index + 1 :] if title_index >= 0 else lines:
        lowered = line.lower()
        if not employment_type and matches_any(lowered, {"full-time", "full time", "intern", "internship"}):
            employment_type = line
            continue
        if not experience_text and ("year" in lowered or "exp" in lowered or "new grad" in lowered):
            experience_text = line
            continue
        if not location and (
            "remote" in lowered
            or "office" in lowered
            or "onsite" in lowered
            or "on-site" in lowered
            or "everywhere" in lowered
            or any(char in line for char in ["+", "•"])
        ):
            location = line
            continue

    if not location:
        for line in lines:
            lowered = line.lower()
            if "remote" in lowered or "office" in lowered or "onsite" in lowered or "everywhere" in lowered:
                location = line
                break

    full_text = normalize_space(" ".join([title, company, employment_type, location, experience_text, card_text]))

    if not is_relevant_title(title):
        return None
    if not is_relevant_employment(full_text):
        return None

    entry_level_ok, reason = is_entry_level(full_text)
    if not entry_level_ok:
        return None

    return {
        "title": title,
        "company": company,
        "employment_type": employment_type,
        "location": location,
        "experience_text": experience_text,
        "entry_level_match_reason": reason,
        "source_page": source_page,
        "job_link": urljoin("https://wellfound.com", href),
        "card_text": card_text,
    }


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


def scrape_wellfound_jobs(
    search_urls: list[str],
    profile_dir: str | None,
    headless: bool,
    scrolls: int,
) -> list[dict]:
    driver = build_driver(headless=headless, profile_dir=profile_dir)
    jobs = []
    try:
        for search_url in search_urls:
            logging.info("Opening %s", search_url)
            driver.get(search_url)
            wait_for_page(driver)
            maybe_close_modal(driver)
            scroll_page(driver, scrolls)

            raw_cards = collect_raw_cards(driver)
            logging.info("Collected %s raw cards from %s", len(raw_cards), search_url)
            for raw_card in raw_cards:
                parsed_job = extract_job_from_card(raw_card, search_url)
                if parsed_job:
                    jobs.append(parsed_job)
    except (TimeoutException, NoSuchWindowException, WebDriverException) as exc:
        raise RuntimeError(f"Wellfound scraping failed: {exc}") from exc
    finally:
        driver.quit()

    return dedupe_jobs(jobs)


def save_csv(rows: list[dict], output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    logging.info("Saved %s jobs to %s", len(rows), path)


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
        description="Scrape entry-level backend/full-stack/SDE jobs directly from Wellfound."
    )
    parser.add_argument(
        "--search-url",
        action="append",
        help="Public Wellfound jobs/role URL to scrape. Repeat this flag for multiple pages.",
    )
    parser.add_argument(
        "--search-urls-file",
        help="Optional text file with one Wellfound search URL per line.",
    )
    parser.add_argument(
        "--profile-dir",
        default="wellfound-chrome-data",
        help="Chrome user data dir for the browser session.",
    )
    parser.add_argument(
        "--scrolls",
        type=int,
        default=4,
        help="How many times to scroll each Wellfound page.",
    )
    parser.add_argument(
        "--output",
        default="wellfound_entry_level_jobs.csv",
        help="Output CSV file.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chrome headless.",
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
    jobs = scrape_wellfound_jobs(
        search_urls=search_urls,
        profile_dir=args.profile_dir,
        headless=args.headless,
        scrolls=args.scrolls,
    )
    allowed_locations = [
        normalize_space(value).lower()
        for value in (args.location or DEFAULT_ALLOWED_LOCATIONS)
        if normalize_space(value)
    ]
    include_remote = not args.no_remote
    filtered_jobs = [
        job
        for job in jobs
        if location_allowed(
            job.get("location", ""),
            " ".join(
                [
                    job.get("title", ""),
                    job.get("company", ""),
                    job.get("employment_type", ""),
                    job.get("experience_text", ""),
                    job.get("card_text", ""),
                ]
            ),
            allowed_locations,
            include_remote,
        )
    ]
    save_csv(filtered_jobs, args.output)


if __name__ == "__main__":
    main()
