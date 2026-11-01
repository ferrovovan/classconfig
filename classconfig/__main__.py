# SPDX-License-Identifier: GPL-3.0-or-later
"""Точка запуска модуля: python3 -m classconfig."""

from __future__ import annotations
import sys
from .cli import main

if __name__ == "__main__":
    sys.exit(main())
