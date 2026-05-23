import argparse
import subprocess
import sys
from pathlib import Path
from datetime import date


ROOT = Path(__file__).resolve().parent
DEFAULT_PYTHON = ROOT / ".venv" / "bin" / "python"

SCRIPT_CONFIG = {
    "linkedin": {
        "script": "main.py",
        "default_output": f"{date.today()}/linkedin_posts.csv",
    },
    "wellfound": {
        "script": "wellfound_jobs.py",
        "default_output": f"{date.today()}/wellfound_entry_level_jobs.csv",
    },
    "yc": {
        "script": "yc_jobs.py",
        "default_output": f"{date.today()}/yc_entry_level_jobs.csv",
    },
    "instahyre": {
        "script": "instahyre_jobs.py",
        "default_output": f"{date.today()}/instahyre_entry_level_jobs.csv",
    },
    "naukri": {
        "script": "naukri_jobs.py",
        "default_output": f"{date.today()}/naukri_entry_level_jobs.csv",
    },
    "ats": {
        "script": "jobs_scraper.py",
        "default_output": f"{date.today()}/ats_entry_level_jobs.csv",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one or more job/post scraping scripts from a single command."
    )
    parser.add_argument(
        "--only",
        action="append",
        choices=sorted(SCRIPT_CONFIG),
        help="Run only the named scraper. Repeat this flag to run multiple.",
    )
    parser.add_argument(
        "--skip",
        action="append",
        choices=sorted(SCRIPT_CONFIG),
        help="Skip the named scraper. Repeat this flag to skip multiple.",
    )
    parser.add_argument(
        "--output-dir",
        default="outputs",
        help="Directory where CSV outputs should be written.",
    )
    parser.add_argument(
        "--linkedin-profile-dir",
        default="chrome-data",
        help="Chrome user data dir for LinkedIn scraping.",
    )
    parser.add_argument(
        "--wellfound-profile-dir",
        default="wellfound-chrome-data",
        help="Chrome user data dir for Wellfound scraping.",
    )
    parser.add_argument(
        "--instahyre-profile-dir",
        default="instahyre-chrome-data",
        help="Chrome user data dir for Instahyre scraping.",
    )
    parser.add_argument(
        "--naukri-profile-dir",
        default="naukri-chrome-data",
        help="Chrome user data dir for Naukri scraping.",
    )
    parser.add_argument(
        "--linkedin-scrolls",
        type=int,
        default=5,
        help="Scroll count for LinkedIn post scraping.",
    )
    parser.add_argument(
        "--wellfound-scrolls",
        type=int,
        default=4,
        help="Scroll count for Wellfound scraping.",
    )
    parser.add_argument(
        "--instahyre-scrolls",
        type=int,
        default=5,
        help="Scroll count for Instahyre scraping.",
    )
    parser.add_argument(
        "--naukri-scrolls",
        type=int,
        default=5,
        help="Scroll count for Naukri scraping.",
    )
    parser.add_argument(
        "--sources-file",
        default="job_sources.csv",
        help="Sources CSV for the ATS scraper.",
    )
    parser.add_argument(
        "--ats-limit",
        type=int,
        help="Optional row limit for the ATS scraper.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Pass headless mode to browser-based scrapers.",
    )
    parser.add_argument(
        "--location",
        action="append",
        help="Allowed location keyword for job filters. Repeat for multiple locations (default: india).",
    )
    parser.add_argument(
        "--no-remote",
        action="store_true",
        help="Exclude remote jobs from CSV outputs.",
    )
    return parser.parse_args()


def resolve_targets(args: argparse.Namespace) -> list[str]:
    if args.only:
        targets = list(dict.fromkeys(args.only))
    else:
        targets = list(SCRIPT_CONFIG)

    skipped = set(args.skip or [])
    return [target for target in targets if target not in skipped]


def ensure_dir(path_value: str) -> str:
    path = (ROOT / path_value).resolve() if not Path(path_value).is_absolute() else Path(path_value)
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def build_command(target: str, args: argparse.Namespace, output_dir: Path) -> list[str]:
    script_name = SCRIPT_CONFIG[target]["script"]
    output_path = output_dir / SCRIPT_CONFIG[target]["default_output"]

    python_executable = str(DEFAULT_PYTHON) if DEFAULT_PYTHON.exists() else sys.executable
    command = [python_executable, str(ROOT / script_name)]

    if target == "linkedin":
        profiles_output = output_path.with_name("linkedin_posts_profiles.csv")
        command.extend(
            [
                "--profile-dir",
                ensure_dir(args.linkedin_profile_dir),
                "--scrolls",
                str(args.linkedin_scrolls),
                "--output",
                str(output_path),
                "--profiles-output",
                str(profiles_output),
            ]
        )
        if args.headless:
            command.append("--headless")
    elif target == "wellfound":
        command.extend(
            [
                "--profile-dir",
                ensure_dir(args.wellfound_profile_dir),
                "--scrolls",
                str(args.wellfound_scrolls),
                "--output",
                str(output_path),
            ]
        )
        if args.headless:
            command.append("--headless")
        if args.location:
            for location in args.location:
                command.extend(["--location", location])
        if args.no_remote:
            command.append("--no-remote")
    elif target == "yc":
        command.extend(["--output", str(output_path)])
        if args.location:
            for location in args.location:
                command.extend(["--location", location])
        if args.no_remote:
            command.append("--no-remote")
    elif target == "instahyre":
        command.extend(
            [
                "--profile-dir",
                ensure_dir(args.instahyre_profile_dir),
                "--scrolls",
                str(args.instahyre_scrolls),
                "--output",
                str(output_path),
            ]
        )
        if args.headless:
            command.append("--headless")
        if args.location:
            for location in args.location:
                command.extend(["--location", location])
        if args.no_remote:
            command.append("--no-remote")
    elif target == "naukri":
        command.extend(
            [
                "--profile-dir",
                ensure_dir(args.naukri_profile_dir),
                "--scrolls",
                str(args.naukri_scrolls),
                "--output",
                str(output_path),
            ]
        )
        if args.headless:
            command.append("--headless")
        if args.location:
            for location in args.location:
                command.extend(["--location", location])
        if args.no_remote:
            command.append("--no-remote")
    elif target == "ats":
        command.extend(
            [
                "--sources-file",
                str((ROOT / args.sources_file).resolve() if not Path(args.sources_file).is_absolute() else Path(args.sources_file)),
                "--output",
                str(output_path),
            ]
        )
        if args.ats_limit is not None:
            command.extend(["--limit", str(args.ats_limit)])
        if args.location:
            for location in args.location:
                command.extend(["--location", location])
        if args.no_remote:
            command.append("--no-remote")

    return command


def main() -> None:
    args = parse_args()
    targets = resolve_targets(args)
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (ROOT / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not targets:
        print("No scrapers selected after applying --only/--skip.")
        raise SystemExit(1)

    failures = []
    for target in targets:
        command = build_command(target, args, output_dir)
        print(f"\n=== Running {target} ===")
        print(" ".join(command))
        completed = subprocess.run(command, cwd=ROOT)
        if completed.returncode != 0:
            failures.append(target)

    if failures:
        print(f"\nFinished with failures: {', '.join(failures)}")
        raise SystemExit(1)

    print("\nAll selected scrapers finished successfully.")


if __name__ == "__main__":
    main()
