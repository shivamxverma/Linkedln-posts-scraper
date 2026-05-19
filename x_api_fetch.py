import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from env_utils import get_env, load_dotenv
from x_oauth_login import refresh_access_token, save_token_payload


API_BASE = "https://api.x.com/2"
DEFAULT_USER_FIELDS = [
    "created_at",
    "description",
    "profile_image_url",
    "protected",
    "public_metrics",
    "username",
    "verified",
]
DEFAULT_TWEET_FIELDS = [
    "author_id",
    "created_at",
    "public_metrics",
    "text",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch authenticated X API data using tokens stored in .env."
    )
    parser.add_argument(
        "--include-posts",
        action="store_true",
        help="Also fetch recent posts for the authenticated user.",
    )
    parser.add_argument(
        "--post-limit",
        type=int,
        default=5,
        help="How many recent posts to fetch when --include-posts is set.",
    )
    parser.add_argument(
        "--output",
        help="Optional JSON file path for the combined API response.",
    )
    return parser.parse_args()


def build_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "User-Agent": "Job-Scraper X API Client",
    }


def get_json(path: str, access_token: str, query: dict[str, str] | None = None) -> dict:
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    request = Request(url, headers=build_headers(access_token), method="GET")
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def refresh_tokens_from_env() -> str:
    client_id = get_env("X_CLIENT_ID")
    refresh_token = get_env("X_REFRESH_TOKEN")
    client_secret = get_env("X_CLIENT_SECRET")
    redirect_uri = get_env("X_REDIRECT_URI", "http://127.0.0.1:8000/callback")
    scopes = (get_env("X_SCOPE") or "tweet.read users.read offline.access").split()

    if not client_id or not refresh_token:
        raise RuntimeError("Missing X_CLIENT_ID or X_REFRESH_TOKEN in .env, so token refresh is unavailable.")

    payload = refresh_access_token(client_id, client_secret, refresh_token)
    save_token_payload(client_id, redirect_uri, scopes, payload)
    access_token = payload.get("access_token")
    if not access_token:
        raise RuntimeError("X token refresh succeeded but did not return an access token.")
    return access_token


def fetch_authenticated_user(access_token: str) -> dict:
    return get_json(
        "/users/me",
        access_token,
        query={"user.fields": ",".join(DEFAULT_USER_FIELDS)},
    )


def fetch_user_posts(access_token: str, user_id: str, post_limit: int) -> dict:
    limited_count = min(max(post_limit, 1), 100)
    return get_json(
        f"/users/{user_id}/tweets",
        access_token,
        query={
            "max_results": str(limited_count),
            "tweet.fields": ",".join(DEFAULT_TWEET_FIELDS),
            "exclude": "retweets,replies",
        },
    )


def maybe_retry_with_refresh(exc: HTTPError, access_token: str) -> str:
    if exc.code not in {401, 403}:
        raise exc
    return refresh_tokens_from_env()


def main() -> None:
    load_dotenv()
    args = parse_args()
    access_token = get_env("X_ACCESS_TOKEN")

    if not access_token:
        raise SystemExit("Missing X_ACCESS_TOKEN in .env. Run `python3 x_oauth_login.py` first.")

    try:
        me_response = fetch_authenticated_user(access_token)
    except HTTPError as exc:
        try:
            access_token = maybe_retry_with_refresh(exc, access_token)
            me_response = fetch_authenticated_user(access_token)
        except RuntimeError as refresh_error:
            raise SystemExit(str(refresh_error)) from exc
        except HTTPError as retry_exc:
            error_body = retry_exc.read().decode("utf-8", errors="replace")
            raise SystemExit(f"X API request failed with HTTP {retry_exc.code}: {error_body}") from retry_exc
    except URLError as exc:
        raise SystemExit(f"X API request failed: {exc.reason}") from exc

    result = {"me": me_response}

    if args.include_posts:
        user_id = ((me_response.get("data") or {}).get("id") or "").strip()
        if not user_id:
            raise SystemExit("X API did not return an authenticated user ID.")
        try:
            result["posts"] = fetch_user_posts(access_token, user_id, args.post_limit)
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Fetching X posts failed with HTTP {exc.code}: {error_body}") from exc
        except URLError as exc:
            raise SystemExit(f"Fetching X posts failed: {exc.reason}") from exc

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
        print(f"Saved X API response to {args.output}")
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
