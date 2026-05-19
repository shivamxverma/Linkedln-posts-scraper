# LinkedIn Posts And Jobs Scraper

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
