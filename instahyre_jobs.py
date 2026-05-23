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


DEFAULT_START_URL = "https://www.instahyre.com/candidate/opportunities/"

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
    "ios",
    "android",
    "frontend",
    "react native",
}

EMPLOYMENT_INCLUDE_TERMS = {
    "full time",
    "full-time",
    "intern",
    "internship",
}

ENTRY_LEVEL_INCLUDE_TERMS = {
    "0 year",
    "1 year",
    "0-1",
    "0 to 1",
    "0–1",
    "fresher",
    "entry level",
    "entry-level",
    "new grad",
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
]

OUTPUT_FIELDS = [
    "title",
    "company",
    "location",
    "experience_text",
    "entry_level_match_reason",
    "job_link",
    "source_page",
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
            " dedicated folder like /Users/shivamverma/Desktop/Job-Scraper/instahyre-chrome-data."
            f" Original error: {exc.msg}"
        ) from exc


def wait_for_page(driver: webdriver.Chrome) -> None:
    WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    time.sleep(random.uniform(2.5, 4.0))


def wait_for_manual_login(driver: webdriver.Chrome, timeout: int = 300) -> None:
    logging.info("Waiting for Instahyre login or visible opportunities page.")
    try:
        WebDriverWait(driver, timeout).until(
            lambda current_driver: "opportunities" in current_driver.current_url
            or "jobs" in current_driver.current_url
            or len(current_driver.find_elements(By.CSS_SELECTOR, 'a[href*="/job/"], a[href*="/candidate/job/"]')) > 0
        )
    except TimeoutException:
        raise RuntimeError(
            "Timed out waiting for Instahyre jobs page. Log in manually in the browser and open the opportunities page."
        ) from None


def scroll_page(driver: webdriver.Chrome, scrolls: int) -> None:
    last_height = driver.execute_script("return document.body.scrollHeight")
    for _ in range(scrolls):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(random.uniform(2.0, 3.5))
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height


def collect_raw_cards(driver: webdriver.Chrome) -> list[dict]:
    script = """
const items = [];
const seen = new Set();
const anchors = document.querySelectorAll('a[href*="/job/"], a[href*="/candidate/job/"]');
for (const anchor of anchors) {
  const title = (anchor.innerText || "").trim();
  const href = anchor.href || "";
  if (!title || !href || seen.has(href)) continue;
  let node = anchor;
  let cardText = "";
  while (node && node !== document.body) {
    const text = (node.innerText || "").trim();
    if (text && text.includes(title) && text.length > title.length + 8 && text.length < 2200) {
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


def extract_job_from_card(raw_card: dict, source_page: str) -> dict | None:
    title = normalize_space(raw_card.get("title", ""))
    job_link = raw_card.get("href", "")
    card_text = normalize_space(raw_card.get("cardText", ""))
    if not title or not job_link:
        return None

    lines = [normalize_space(line) for line in raw_card.get("cardText", "").splitlines() if normalize_space(line)]
    company = lines[0] if lines and lines[0] != title else ""
    location = ""
    experience_text = ""

    for line in lines[1:]:
        lowered = line.lower()
        if not location and any(term in lowered for term in ["remote", "office", "hyderabad", "bangalore", "pune", "gurgaon", "mumbai", "delhi", "india"]):
            location = line
        if not experience_text and ("year" in lowered or "fresher" in lowered or "entry" in lowered or "junior" in lowered):
            experience_text = line

    combined_text = normalize_space(" ".join([title, company, location, experience_text, card_text]))
    if not is_relevant_title(title):
        return None
    if not matches_any(combined_text.lower(), EMPLOYMENT_INCLUDE_TERMS):
        return None

    entry_level_ok, reason = is_entry_level(combined_text)
    if not entry_level_ok:
        return None

    return {
        "title": title,
        "company": company,
        "location": location,
        "experience_text": experience_text,
        "entry_level_match_reason": reason,
        "job_link": urljoin("https://www.instahyre.com", job_link),
        "source_page": source_page,
        "card_text": card_text,
    }


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
    logging.info("Saved %s Instahyre jobs to %s", len(rows), path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape entry-level backend/full-stack/SDE jobs from Instahyre after manual login."
    )
    parser.add_argument(
        "--start-url",
        default=DEFAULT_START_URL,
        help="Instahyre jobs/opportunities page to open after login.",
    )
    parser.add_argument(
        "--profile-dir",
        default="instahyre-chrome-data",
        help="Chrome user data dir for the browser session.",
    )
    parser.add_argument(
        "--scrolls",
        type=int,
        default=5,
        help="How many times to scroll the opportunities page.",
    )
    parser.add_argument(
        "--output",
        default="instahyre_entry_level_jobs.csv",
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
    driver = build_driver(headless=args.headless, profile_dir=args.profile_dir)
    jobs = []
    try:
        logging.info("Opening %s", args.start_url)
        driver.get(args.start_url)
        wait_for_page(driver)
        wait_for_manual_login(driver)
        scroll_page(driver, args.scrolls)
        raw_cards = collect_raw_cards(driver)
        logging.info("Collected %s raw cards from Instahyre", len(raw_cards))
        for raw_card in raw_cards:
            job = extract_job_from_card(raw_card, driver.current_url)
            if job:
                jobs.append(job)
    except (TimeoutException, NoSuchWindowException, WebDriverException) as exc:
        raise RuntimeError(f"Instahyre scraping failed: {exc}") from exc
    finally:
        driver.quit()

    allowed_locations = [
        normalize_space(value).lower()
        for value in (args.location or DEFAULT_ALLOWED_LOCATIONS)
        if normalize_space(value)
    ]
    include_remote = not args.no_remote
    location_filtered = [
        job
        for job in dedupe_jobs(jobs)
        if location_allowed(
            job.get("location", ""),
            " ".join(
                [
                    job.get("title", ""),
                    job.get("company", ""),
                    job.get("experience_text", ""),
                    job.get("card_text", ""),
                ]
            ),
            allowed_locations,
            include_remote,
        )
    ]
    save_csv(location_filtered, args.output)


if __name__ == "__main__":
    main()
