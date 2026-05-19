import argparse
import base64
import hashlib
import json
import secrets
import threading
import time
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

from env_utils import get_env, load_dotenv, set_env_values


AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
REVOKE_URL = "https://api.x.com/2/oauth2/revoke"
DEFAULT_SCOPES = ["tweet.read", "users.read", "offline.access"]


def generate_code_verifier() -> str:
    return secrets.token_urlsafe(64).rstrip("=")


def generate_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def build_basic_auth_header(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("utf-8")


def post_form(url: str, form_data: dict[str, str], headers: dict[str, str] | None = None) -> dict:
    encoded = urlencode(form_data).encode("utf-8")
    request_headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if headers:
        request_headers.update(headers)

    request = Request(url, data=encoded, headers=request_headers, method="POST")
    with urlopen(request, timeout=30) as response:
        return json.load(response)


@dataclass
class CallbackResult:
    code: str | None = None
    state: str | None = None
    error: str | None = None
    error_description: str | None = None


class OAuthCallbackServer(HTTPServer):
    def __init__(self, server_address: tuple[str, int]):
        super().__init__(server_address, OAuthCallbackHandler)
        self.result = CallbackResult()


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        self.server.result = CallbackResult(
            code=query.get("code", [None])[0],
            state=query.get("state", [None])[0],
            error=query.get("error", [None])[0],
            error_description=query.get("error_description", [None])[0],
        )

        if self.server.result.code:
            body = (
                "<html><body><h2>X authorization complete.</h2>"
                "<p>You can close this tab and return to the terminal.</p></body></html>"
            )
        else:
            body = (
                "<html><body><h2>X authorization failed.</h2>"
                "<p>Check the terminal for details.</p></body></html>"
            )

        body_bytes = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def log_message(self, format: str, *args) -> None:
        return


def wait_for_callback(redirect_uri: str, timeout: int) -> CallbackResult:
    parsed = urlparse(redirect_uri)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("X OAuth login script currently supports only localhost http redirect URIs.")

    port = parsed.port or 80
    host = parsed.hostname
    server = OAuthCallbackServer((host, port))
    worker = threading.Thread(target=server.handle_request, daemon=True)
    worker.start()
    worker.join(timeout)

    if worker.is_alive():
        server.server_close()
        raise TimeoutError("Timed out waiting for the X OAuth callback.")

    result = server.result
    server.server_close()
    return result


def build_authorize_url(
    client_id: str,
    redirect_uri: str,
    scopes: list[str],
    state: str,
    code_challenge: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(scopes),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_token(
    client_id: str,
    client_secret: str | None,
    redirect_uri: str,
    code: str,
    code_verifier: str,
) -> dict:
    form_data = {
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    headers: dict[str, str] = {}
    if client_secret:
        headers["Authorization"] = build_basic_auth_header(client_id, client_secret)
    else:
        form_data["client_id"] = client_id
    return post_form(TOKEN_URL, form_data, headers=headers)


def refresh_access_token(
    client_id: str,
    client_secret: str | None,
    refresh_token: str,
) -> dict:
    form_data = {
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    headers: dict[str, str] = {}
    if client_secret:
        headers["Authorization"] = build_basic_auth_header(client_id, client_secret)
    else:
        form_data["client_id"] = client_id
    return post_form(TOKEN_URL, form_data, headers=headers)


def revoke_token(client_id: str, client_secret: str | None, token: str) -> dict:
    form_data = {"token": token}
    headers: dict[str, str] = {}
    if client_secret:
        headers["Authorization"] = build_basic_auth_header(client_id, client_secret)
    else:
        form_data["client_id"] = client_id
    return post_form(REVOKE_URL, form_data, headers=headers)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Authorize this repo against the X API using OAuth 2.0 PKCE.")
    parser.add_argument(
        "--client-id",
        default=get_env("X_CLIENT_ID"),
        help="X OAuth 2.0 client ID. Defaults to X_CLIENT_ID from .env.",
    )
    parser.add_argument(
        "--client-secret",
        default=get_env("X_CLIENT_SECRET"),
        help="Optional X OAuth 2.0 client secret for confidential clients.",
    )
    parser.add_argument(
        "--redirect-uri",
        default=get_env("X_REDIRECT_URI", "http://127.0.0.1:8000/callback"),
        help="Redirect URI configured in your X app.",
    )
    parser.add_argument(
        "--scope",
        action="append",
        dest="scopes",
        help="OAuth scope to request. Repeat the flag to add more scopes.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Seconds to wait for the browser callback.",
    )
    parser.add_argument(
        "--no-open-browser",
        action="store_true",
        help="Print the authorization URL instead of opening it automatically.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Use X_REFRESH_TOKEN from .env to fetch a fresh access token.",
    )
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Revoke X_ACCESS_TOKEN from .env.",
    )
    return parser.parse_args()


def require_client_id(client_id: str | None) -> str:
    if client_id:
        return client_id
    raise SystemExit("Missing X client ID. Set X_CLIENT_ID in .env or pass --client-id.")


def save_token_payload(client_id: str, redirect_uri: str, scopes: list[str], payload: dict) -> None:
    env_updates = {
        "X_CLIENT_ID": client_id,
        "X_REDIRECT_URI": redirect_uri,
        "X_SCOPE": " ".join(scopes),
        "X_ACCESS_TOKEN": payload.get("access_token", ""),
        "X_TOKEN_TYPE": payload.get("token_type", ""),
        "X_EXPIRES_IN": str(payload.get("expires_in", "")),
        "X_AUTHORIZED_AT": str(int(time.time())),
    }

    refresh_token = payload.get("refresh_token")
    if refresh_token:
        env_updates["X_REFRESH_TOKEN"] = refresh_token

    set_env_values(env_updates)


def main() -> None:
    load_dotenv()
    args = parse_args()
    client_id = require_client_id(args.client_id)
    client_secret = args.client_secret

    if args.refresh:
        refresh_token = get_env("X_REFRESH_TOKEN")
        if not refresh_token:
            raise SystemExit("Missing X_REFRESH_TOKEN in .env.")
        payload = refresh_access_token(client_id, client_secret, refresh_token)
        scopes = (get_env("X_SCOPE") or " ".join(DEFAULT_SCOPES)).split()
        save_token_payload(client_id, args.redirect_uri, scopes, payload)
        print("Refreshed X access token and saved it to .env.")
        print(json.dumps(payload, indent=2))
        return

    if args.revoke:
        access_token = get_env("X_ACCESS_TOKEN")
        if not access_token:
            raise SystemExit("Missing X_ACCESS_TOKEN in .env.")
        payload = revoke_token(client_id, client_secret, access_token)
        print("Revoked X access token.")
        print(json.dumps(payload, indent=2))
        return

    scopes = args.scopes or (get_env("X_SCOPE") or " ".join(DEFAULT_SCOPES)).split()
    state = secrets.token_urlsafe(24)
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    authorize_url = build_authorize_url(
        client_id=client_id,
        redirect_uri=args.redirect_uri,
        scopes=scopes,
        state=state,
        code_challenge=code_challenge,
    )

    print("Open this URL to authorize the app with X:")
    print(authorize_url)

    if not args.no_open_browser:
        webbrowser.open(authorize_url)

    print(f"Waiting for callback on {args.redirect_uri} ...")
    result = wait_for_callback(args.redirect_uri, args.timeout)

    if result.error:
        raise SystemExit(
            f"X authorization failed: {result.error} {result.error_description or ''}".strip()
        )
    if not result.code:
        raise SystemExit("X authorization did not return a code.")
    if result.state != state:
        raise SystemExit("State mismatch during X OAuth callback.")

    try:
        payload = exchange_code_for_token(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=args.redirect_uri,
            code=result.code,
            code_verifier=code_verifier,
        )
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"X token exchange failed with HTTP {exc.code}: {error_body}") from exc
    except URLError as exc:
        raise SystemExit(f"X token exchange failed: {exc.reason}") from exc

    save_token_payload(client_id, args.redirect_uri, scopes, payload)
    print("Saved X OAuth tokens to .env.")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
