from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backfill import APPROVAL_ENV, require_owner_approval


class BackfillGateTests(unittest.TestCase):
    def test_refuses_without_approval(self) -> None:
        with patch.dict(os.environ, {APPROVAL_ENV: ""}, clear=False):
            os.environ.pop(APPROVAL_ENV, None)
            with self.assertRaises(SystemExit) as ctx:
                require_owner_approval([])
            self.assertIn("refused: full lake backfill", str(ctx.exception))

    def test_accepts_flag(self) -> None:
        with patch.dict(os.environ, {APPROVAL_ENV: ""}, clear=False):
            os.environ.pop(APPROVAL_ENV, None)
            require_owner_approval(["--i-have-owner-approval"])

    def test_accepts_env(self) -> None:
        with patch.dict(os.environ, {APPROVAL_ENV: "1"}):
            require_owner_approval([])
