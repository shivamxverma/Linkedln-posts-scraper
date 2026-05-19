# LinkedIn Posts And Jobs Scraper

## Shared local secrets

Create a local `.env` file from `.env.example` before running browser-based scrapers:

```bash
cp .env.example .env
```

Supported auth keys:

```bash
LINKEDIN_EMAIL=your-linkedin-email
LINKEDIN_PASSWORD=your-linkedin-password
X_CLIENT_ID=your-x-client-id
X_CLIENT_SECRET=your-x-client-secret
X_REDIRECT_URI=http://127.0.0.1:8000/callback
X_SCOPE=tweet.read users.read offline.access
```

Right now this repo uses the LinkedIn credentials automatically in `main.py` if they are present.
The repo now also includes an X API OAuth helper script for getting user-context tokens locally.

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

If `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD` are set in `.env`, the scraper will try to sign in
automatically. If they are missing, it falls back to the current manual-login flow in the opened browser.

This exports:

- `linkedin_posts.csv`
- `linkedin_posts_profiles.csv`

## X API OAuth login

This repo includes [x_oauth_login.py](/Users/shivamverma/Desktop/Job-Scraper/x_oauth_login.py), a local OAuth 2.0 PKCE flow for X API access.

Before running it, create an app in the X Developer Console and configure the callback URL to exactly match:

```text
http://127.0.0.1:8000/callback
```

Then set `X_CLIENT_ID` in `.env`. Add `X_CLIENT_SECRET` too if your X app is configured as a confidential client.

Run:

```bash
python3 x_oauth_login.py
```

What it does:

- Opens the X authorization page in your browser.
- Waits for the localhost callback.
- Exchanges the authorization code for an access token.
- Saves `X_ACCESS_TOKEN` and `X_REFRESH_TOKEN` into `.env`.

Refresh an expired token:

```bash
python3 x_oauth_login.py --refresh
```

Revoke the current access token:

```bash
python3 x_oauth_login.py --revoke
```

Fetch your authenticated X profile:

```bash
python3 x_api_fetch.py
```

Fetch your authenticated X profile plus recent posts:

```bash
python3 x_api_fetch.py --include-posts --post-limit 5
```

Optional JSON output:

```bash
python3 x_api_fetch.py --include-posts --output outputs/x_me.json
```

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
