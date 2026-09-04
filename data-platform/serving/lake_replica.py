from __future__ import annotations

"""Copy lake parquet to a second location. Not git. Default D:\\People_Lake_Replica."""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAKE = ROOT / "lake"
DEFAULT_DEST = Path(r"D:\People_Lake_Replica")
LAYERS = ("people_bronze", "people_silver", "people_gold", "people_logs")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dest", default=str(DEFAULT_DEST))
    parser.add_argument("--prefix", default="rehearsal_1p00")
    args = parser.parse_args(argv)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    copied = []
    for layer in LAYERS:
        src = LAKE / layer / args.prefix
        if not src.exists():
            print("skip_missing", src)
            continue
        target = dest / layer / args.prefix
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(src, target)
        copied.append(str(target))
        print("copied", src, "->", target)
    manifest = dest / args.prefix / "replica.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text("\n".join(copied) + "\n", encoding="utf-8")
    print("lake_replica_ok", dest)
    print("note: no Hetzner storage-box credentials in env; local replica only. Do not commit.")
    return 0 if copied else 1


if __name__ == "__main__":
    raise SystemExit(main())
