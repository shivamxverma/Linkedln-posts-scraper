import argparse
import csv
import logging
import random
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import quote_plus

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException, TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from env_utils import get_env, load_dotenv


DEFAULT_KEYWORDS = [
    "hiring backend developer",
    "hiring backend engineer",
    "backend developer opening startup",
    "backend engineer hiring startup",
    "raised funding",
    "seed round",
    "series a",
    "series b",
    "funding announcement startup",
]

POST_FIELDS = [
    "keyword",
    "post_type",
    "author",
    "author_headline",
    "author_role_type",
    "profile_link",
    "post_text",
    "post_link",
]

PROFILE_FIELDS = [
    "author",
    "author_headline",
    "author_role_type",
    "profile_link",
    "post_types",
    "keywords",
    "post_count",
]

FUNDING_TERMS = {
    "raised funding",
    "raised",
    "funding",
    "fundraise",
    "fundraising",
    "seed round",
    "pre-seed",
    "series a",
    "series b",
    "series c",
    "venture capital",
    "backed by",
    "investment",
}

BACKEND_HIRING_TERMS = {
    "hiring backend",
    "backend developer",
    "backend engineer",
    "python developer",
    "python engineer",
    "django developer",
    "node.js developer",
    "nodejs developer",
    "golang developer",
    "java backend",
    "software engineer backend",
}

FOUNDER_ROLE_TERMS = {
    "founder",
    "co-founder",
    "cofounder",
    "ceo",
    "cto",
    "owner",
    "building",
}

ENGINEER_ROLE_TERMS = {
    "engineer",
    "developer",
    "engineering",
    "software",
    "backend",
    "full stack",
    "tech lead",
}


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


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
    profile_name_markers = {"Default", "Guest Profile"}

    if (
        profile_path.name in profile_name_markers
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
        profile_hint = ""
        if profile_dir:
            profile_hint = (
                " If you passed your Chrome profile, close all Chrome windows first. "
                "If you passed a path ending in 'Default' or 'Profile 1', the script now "
                "maps that automatically, but the profile still cannot be in active use."
            )
        raise RuntimeError(
            "Chrome could not be started by Selenium."
            f"{profile_hint} Original error: {exc.msg}"
        ) from exc


def wait_for_login(driver: webdriver.Chrome, timeout: int = 180) -> None:
    linkedin_email = get_env("LINKEDIN_EMAIL")
    linkedin_password = get_env("LINKEDIN_PASSWORD")

    driver.get("https://www.linkedin.com/login")
    if linkedin_email and linkedin_password:
        logging.info("Attempting LinkedIn login with credentials from .env.")
        username_input = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "username"))
        )
        password_input = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "password"))
        )
        username_input.clear()
        username_input.send_keys(linkedin_email)
        password_input.clear()
        password_input.send_keys(linkedin_password)
        driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    else:
        logging.info(
            "Waiting for LinkedIn login. Complete login in the opened browser if needed."
        )

    try:
        WebDriverWait(driver, timeout).until(
            lambda current_driver: "linkedin.com/feed" in current_driver.current_url
            or "linkedin.com/search/results/content" in current_driver.current_url
        )
        logging.info("LinkedIn login detected.")
    except TimeoutException:
        raise RuntimeError(
            "Timed out waiting for LinkedIn login. Check LINKEDIN_EMAIL/LINKEDIN_PASSWORD"
            " in .env or log in manually and try again."
        ) from None


def search_url(keyword: str) -> str:
    encoded_keyword = quote_plus(keyword)
    return (
        "https://www.linkedin.com/search/results/content/"
        f"?datePosted=%22past-week%22&keywords={encoded_keyword}&origin=GLOBAL_SEARCH_HEADER"
    )


def scroll_results(driver: webdriver.Chrome, scrolls: int) -> None:
    if scrolls < 1:
        return

    last_height = driver.execute_script("return document.body.scrollHeight")
    for _ in range(scrolls):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(random.uniform(2.0, 4.0))
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height


def normalize_profile_link(link: str) -> str:
    if not link:
        return ""
    cleaned_link = link.split("?")[0]
    if cleaned_link.startswith("/"):
        return f"https://www.linkedin.com{cleaned_link}"
    return cleaned_link


def normalize_post_link(link: str) -> str:
    if not link:
        return ""
    cleaned_link = link.split("?")[0]
    if cleaned_link.startswith("/"):
        return f"https://www.linkedin.com{cleaned_link}"
    return cleaned_link


def clean_text(value: str) -> str:
    return " ".join(value.split())


def matches_any_term(text: str, terms: set[str]) -> bool:
    lowered_text = text.lower()
    return any(term in lowered_text for term in terms)


def classify_post_type(post_text: str, keyword: str) -> str:
    combined_text = f"{keyword} {post_text}".lower()
    if matches_any_term(combined_text, BACKEND_HIRING_TERMS):
        return "backend_hiring"
    if matches_any_term(combined_text, FUNDING_TERMS):
        return "funding"
    return "other"


def classify_author_role(author_headline: str, post_text: str) -> str:
    combined_text = f"{author_headline} {post_text}".lower()
    if matches_any_term(combined_text, FOUNDER_ROLE_TERMS):
        return "founder"
    if matches_any_term(combined_text, ENGINEER_ROLE_TERMS):
        return "engineer"
    return "other"


def extract_post_link(article) -> str:
    for anchor in article.find_all("a", href=True):
        href = anchor["href"]
        if "/feed/update/" in href or "/posts/" in href:
            return normalize_post_link(href)
    return ""


def extract_profile_info(article) -> tuple[str, str]:
    for anchor in article.find_all("a", href=True):
        href = anchor["href"]
        if "/in/" in href or "/company/" in href:
            author = clean_text(anchor.get_text(" ", strip=True))
            if author:
                return author, normalize_profile_link(href)
    return "", ""


def extract_author_headline(article) -> str:
    candidate_selectors = [
        ".update-components-actor__description",
        ".update-components-actor__sub-description",
        ".feed-shared-actor__description",
        ".feed-shared-actor__sub-description",
    ]

    for selector in candidate_selectors:
        node = article.select_one(selector)
        if node:
            text = clean_text(node.get_text(" ", strip=True))
            if text:
                return text

    return ""


def extract_post_text(article) -> str:
    candidate_selectors = [
        '[data-test-id="main-feed-activity-card__commentary"]',
        ".update-components-text",
        ".feed-shared-update-v2__description",
        ".feed-shared-inline-show-more-text",
        ".attributed-text-segment-list__content",
    ]

    for selector in candidate_selectors:
        node = article.select_one(selector)
        if node:
            text = clean_text(node.get_text(" ", strip=True))
            if text:
                return text

    return clean_text(article.get_text(" ", strip=True))


def parse_posts(page_source: str, keyword: str) -> list[dict]:
    soup = BeautifulSoup(page_source, "html.parser")
    posts = []

    for article in soup.find_all("div", class_=lambda value: value and "occludable-update" in value):
        post_link = extract_post_link(article)
        author, profile_link = extract_profile_info(article)
        author_headline = extract_author_headline(article)
        post_text = extract_post_text(article)
        post_type = classify_post_type(post_text, keyword)
        author_role_type = classify_author_role(author_headline, post_text)

        if (
            not post_link
            or not author
            or not post_text
            or post_type == "other"
            or author_role_type == "other"
        ):
            continue

        posts.append(
            {
                "keyword": keyword,
                "post_type": post_type,
                "author": author,
                "author_headline": author_headline,
                "author_role_type": author_role_type,
                "profile_link": profile_link,
                "post_text": post_text,
                "post_link": post_link,
            }
        )

    if posts:
        return posts

    for article in soup.find_all("article"):
        post_link = extract_post_link(article)
        author, profile_link = extract_profile_info(article)
        author_headline = extract_author_headline(article)
        post_text = extract_post_text(article)
        post_type = classify_post_type(post_text, keyword)
        author_role_type = classify_author_role(author_headline, post_text)

        if (
            not post_link
            or not author
            or not post_text
            or post_type == "other"
            or author_role_type == "other"
        ):
            continue

        posts.append(
            {
                "keyword": keyword,
                "post_type": post_type,
                "author": author,
                "author_headline": author_headline,
                "author_role_type": author_role_type,
                "profile_link": profile_link,
                "post_text": post_text,
                "post_link": post_link,
            }
        )

    return posts


def dedupe_posts(posts: list[dict]) -> list[dict]:
    seen = set()
    unique_posts = []
    for post in posts:
        key = post.get("post_link") or f'{post.get("author", "")}:{post.get("post_text", "")}'
        if not key or key in seen:
            continue
        seen.add(key)
        unique_posts.append(post)
    return unique_posts


def build_profile_rows(posts: Iterable[dict]) -> list[dict]:
    grouped_profiles: dict[str, dict] = {}

    for post in posts:
        profile_link = post.get("profile_link", "")
        author = post.get("author", "").strip()
        key = profile_link or author
        if not key:
            continue

        row = grouped_profiles.setdefault(
            key,
            {
                "author": author,
                "author_headline": post.get("author_headline", "").strip(),
                "author_role_type": post.get("author_role_type", "").strip(),
                "profile_link": profile_link,
                "keywords": set(),
                "post_types": set(),
                "post_count": 0,
            },
        )
        if post.get("keyword"):
            row["keywords"].add(post["keyword"])
        if post.get("post_type"):
            row["post_types"].add(post["post_type"])
        row["post_count"] += 1

    profile_rows = []
    for row in grouped_profiles.values():
        profile_rows.append(
            {
                "author": row["author"],
                "author_headline": row["author_headline"],
                "author_role_type": row["author_role_type"],
                "profile_link": row["profile_link"],
                "post_types": ", ".join(sorted(row["post_types"])),
                "keywords": ", ".join(sorted(row["keywords"])),
                "post_count": row["post_count"],
            }
        )

    profile_rows.sort(key=lambda item: (-item["post_count"], item["author"].lower()))
    return profile_rows


def scrape_posts(
    keywords: list[str],
    scrolls: int = 5,
    headless: bool = False,
    profile_dir: str | None = None,
) -> list[dict]:
    driver = build_driver(headless=headless, profile_dir=profile_dir)
    all_posts = []

    try:
        wait_for_login(driver)
        for keyword in keywords:
            logging.info('Searching posts for keyword: "%s"', keyword)
            driver.get(search_url(keyword))
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            time.sleep(random.uniform(5.0, 10.0))
            scroll_results(driver, scrolls)
            parsed_posts = parse_posts(driver.page_source, keyword)
            logging.info("Found %s post candidates for keyword: %s", len(parsed_posts), keyword)
            all_posts.extend(parsed_posts)
    finally:
        driver.quit()

    return dedupe_posts(all_posts)


def save_csv(rows: list[dict], output_path: str, fieldnames: list[str]) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    logging.info("Saved %s rows to %s", len(rows), path)


def derive_profiles_output_path(posts_output_path: str) -> str:
    path = Path(posts_output_path)
    if path.suffix:
        return str(path.with_name(f"{path.stem}_profiles{path.suffix}"))
    return f"{posts_output_path}_profiles.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search LinkedIn posts for hiring, startup, and funding updates."
    )
    parser.add_argument(
        "--keyword",
        action="append",
        dest="keywords",
        help="Keyword to search. Repeat this flag to search multiple keywords.",
    )
    parser.add_argument(
        "--keywords-file",
        help="Optional text file with one keyword per line.",
    )
    parser.add_argument(
        "--scrolls",
        type=int,
        default=5,
        help="How many times to scroll each search results page.",
    )
    parser.add_argument(
        "--output",
        default="linkedin_posts.csv",
        help="Where to write the post-level CSV output.",
    )
    parser.add_argument(
        "--profiles-output",
        help="Optional CSV path for the deduplicated author/profile list.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chrome in headless mode. Usually not recommended for first-time login.",
    )
    parser.add_argument(
        "--profile-dir",
        help="Optional Chrome user data directory so LinkedIn login can be reused.",
    )
    args = parser.parse_args()
    if args.scrolls < 1:
        parser.error("--scrolls must be at least 1")
    return args


def load_keywords(args: argparse.Namespace) -> list[str]:
    keywords = list(args.keywords or [])

    if args.keywords_file:
        file_keywords = [
            line.strip()
            for line in Path(args.keywords_file).read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        keywords.extend(file_keywords)

    if not keywords:
        keywords = DEFAULT_KEYWORDS

    return list(dict.fromkeys(keywords))


def main() -> None:
    load_dotenv()
    configure_logging()
    args = parse_args()
    keywords = load_keywords(args)

    logging.info("Running LinkedIn scraper for %s keywords.", len(keywords))
    posts = scrape_posts(
        keywords=keywords,
        scrolls=args.scrolls,
        headless=args.headless,
        profile_dir=args.profile_dir,
    )

    if not posts:
        logging.warning("No posts found for the requested keywords.")
        return

    profiles_output = args.profiles_output or derive_profiles_output_path(args.output)
    profile_rows = build_profile_rows(posts)

    save_csv(posts, args.output, POST_FIELDS)
    save_csv(profile_rows, profiles_output, PROFILE_FIELDS)


if __name__ == "__main__":
    main()
