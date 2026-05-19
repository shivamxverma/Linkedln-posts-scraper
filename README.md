# LinkedIn Posts And Jobs Scraper

## Run everything

Use the single runner script if you want one command for all scrapers:

```bash
python3 run_all.py
```

Examples:

```bash
python3 run_all.py --only yc --only wellfound
python3 run_all.py --skip linkedin
python3 run_all.py --output-dir outputs --ats-limit 25
```

This writes all CSV files into `outputs/` by default.

## LinkedIn post scraper

Run:

```bash
python3 main.py --profile-dir /Users/shivamverma/Desktop/Job-Scraper/chrome-data
```

This exports:

- `linkedin_posts.csv`
- `linkedin_posts_profiles.csv`

## Entry-level jobs scraper

The second script pulls public job listings from ATS boards like Greenhouse and Lever,
then filters for roles related to backend, full stack, software engineer, or SDE with
intern/full-time and 0-1 year style signals.

Edit [job_sources.csv](/Users/shivamverma/Desktop/Job-Scraper/job_sources.csv) and add rows in this format:

```csv
company,source,board_token
Stripe,greenhouse,stripe
Postman,lever,postman
```

Run:

```bash
python3 jobs_scraper.py --sources-file job_sources.csv --output entry_level_jobs.csv
```

This exports:

- `entry_level_jobs.csv`

## Wellfound jobs scraper

This browser-driven script opens public Wellfound role/jobs pages directly and filters
for entry-level backend, full stack, and SDE-style jobs.

Run:

```bash
python3 wellfound_jobs.py --profile-dir /Users/shivamverma/Desktop/Job-Scraper/wellfound-chrome-data
```

Optional custom pages:

```bash
python3 wellfound_jobs.py \
  --profile-dir /Users/shivamverma/Desktop/Job-Scraper/wellfound-chrome-data \
  --search-url https://wellfound.com/role/backend-engineer \
  --search-url https://wellfound.com/role/developer
```

This exports:

- `wellfound_entry_level_jobs.csv`

## YC jobs scraper

This script reads Y Combinator's public jobs pages directly and filters for
entry-level backend, full stack, and SDE-style roles.

Run:

```bash
python3 yc_jobs.py --output yc_entry_level_jobs.csv
```

This exports:

- `yc_entry_level_jobs.csv`

## Instahyre jobs scraper

Instahyre appears to be more session-gated, so this script opens Chrome,
lets you log in manually, and then extracts visible job cards from the
opportunities page.

Run:

```bash
python3 instahyre_jobs.py --profile-dir /Users/shivamverma/Desktop/Job-Scraper/instahyre-chrome-data
```

This exports:

- `instahyre_entry_level_jobs.csv`
