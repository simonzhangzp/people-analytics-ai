from __future__ import annotations

"""Confirm Data API does not expose people_v2. Does not use live-site .env.local (v1)."""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

EDGE_ENV = Path(r"D:\EdgeAI_Strategy\.env")


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value and value.strip():
        return value.strip()
    if not EDGE_ENV.exists():
        return None
    for line in EDGE_ENV.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        raw = line.strip()
        if raw.startswith(name + "="):
            return raw.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> None:
    url = _env("PEOPLE_SUPABASE_URL") or f"https://{PEOPLE_REF}.supabase.co"
    refuse_blocked(url)
    if PEOPLE_REF not in url:
        raise SystemExit(f"refused: PEOPLE_SUPABASE_URL is not {PEOPLE_REF}")
    key = _env("PEOPLE_SUPABASE_ANON_KEY")
    if not key:
        print("people_v2_data_api_skipped_no_anon_key")
        print("sql_revoke_is_source_of_truth")
        return
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    req = urllib.request.Request(
        url + "/rest/v1/people_v2.people_mart_workforce_overview?select=*&limit=1",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode()
            raise SystemExit(f"refused: Data API exposed people_v2 ({resp.status} {body[:80]})")
    except urllib.error.HTTPError as error:
        print("people_v2_rest", error.code)
        if error.code not in {401, 403, 404, 406}:
            # PostgREST unknown schema/table is typically 404 / PGRST
            raise SystemExit(f"unexpected Data API status {error.code}")
    spec = urllib.request.Request(url + "/rest/v1/", headers=headers)
    try:
        with urllib.request.urlopen(spec, timeout=20) as resp:
            text = resp.read().decode()
    except urllib.error.HTTPError as error:
        print("openapi", error.code)
        return
    if "people_v2" in text:
        raise SystemExit("refused: OpenAPI documents people_v2")
    print("openapi_people_v2_absent")


if __name__ == "__main__":
    main()
