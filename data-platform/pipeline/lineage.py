from __future__ import annotations

"""Simulator / gold lineage: git sha, file hashes, gold parquet manifests. Lake stays out of git."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
BASELINE = ROOT / "simulator" / "scenario" / "baseline.yaml"
SCENARIO_DIR = ROOT / "simulator" / "scenario" / "scenarios"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_head(repo: Path = REPO) -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=repo,
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return out.strip()
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def baseline_sha() -> str:
    return sha256_file(BASELINE) if BASELINE.exists() else ""


def scenario_versions() -> dict:
    out: dict[str, str] = {}
    if not SCENARIO_DIR.exists():
        return out
    for path in sorted(SCENARIO_DIR.glob("*.yaml")):
        text = path.read_text(encoding="utf-8")
        version = ""
        for line in text.splitlines():
            if line.startswith("version:"):
                version = line.split(":", 1)[1].strip().strip('"').strip("'")
                break
        out[path.stem] = {
            "version": version,
            "sha256": sha256_file(path),
        }
    return out


def sha256_parquet_content(path: Path) -> str:
    import pyarrow.parquet as pq

    df = pq.read_table(path).to_pandas()
    df = df.reindex(sorted(df.columns), axis=1)
    for col in df.columns:
        if str(df[col].dtype).startswith("float"):
            df[col] = df[col].round(10)
    df = df.sort_values(list(df.columns), kind="mergesort", ignore_index=True)
    return hashlib.sha256(df.to_csv(index=False).encode("utf-8")).hexdigest()


def gold_manifest(gold_dir: Path) -> dict[str, str]:
    files = {}
    if not gold_dir.exists():
        return files
    for path in sorted(gold_dir.glob("*.parquet")):
        files[path.name] = sha256_parquet_content(path)
    return files


def manifests_equal(a: dict[str, str], b: dict[str, str]) -> bool:
    return a == b


def write_manifest(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def run_lineage(seed: int, gold_dir: Path | None = None) -> dict:
    payload = {
        "simulator_code_sha": git_head(),
        "seed": str(seed),
        "baseline_sha": baseline_sha(),
        "scenario_versions": scenario_versions(),
    }
    if gold_dir is not None:
        payload["gold_sha256"] = gold_manifest(gold_dir)
    return payload
