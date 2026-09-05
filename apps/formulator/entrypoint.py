from __future__ import annotations

"""Bootstrap People Analytics overlay, then start Data Formulator."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from people_layer.inject import install  # noqa: E402

install()

from data_formulator.app import run_app  # noqa: E402

if __name__ == "__main__":
    run_app()
