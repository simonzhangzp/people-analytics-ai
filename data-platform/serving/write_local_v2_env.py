from __future__ import annotations

"""Write .env.local PEOPLE_DB_URL from EdgeAI env. Does not print the password."""

import sys
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from apply import connect_app, ensure_people_app_password  # noqa: E402
from people_refs import PEOPLE_REF, refuse_blocked  # noqa: E402

DEST = ROOT.parent / ".env.local"


def main() -> int:
    refuse_blocked(PEOPLE_REF)
    password = ensure_people_app_password()
    conn = connect_app()
    host = conn.info.host
    port = conn.info.port or 6543
    conn.close()
    url = (
        f"postgresql://people_app.{PEOPLE_REF}:{quote_plus(password)}@{host}:{port}/postgres?sslmode=require"
    )
    lines = []
    if DEST.exists():
        lines = DEST.read_text(encoding="utf-8").splitlines()
        lines = [
            ln
            for ln in lines
            if not ln.startswith("PEOPLE_DB_URL=") and not ln.startswith("PEOPLE_SERVING_REF=")
        ]
    lines.append(f"PEOPLE_SERVING_REF={PEOPLE_REF}")
    lines.append(f"PEOPLE_DB_URL={url}")
    DEST.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", DEST.name, "host", host, "port", port, "user", f"people_app.{PEOPLE_REF}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
