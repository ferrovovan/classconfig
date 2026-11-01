#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Синхронизирует манифест mcp/mcp.json в web/public/mcp.json (для GitHub Pages).

Использование:
    python3 mcp/sync_web_manifest.py           # скопировать
    python3 mcp/sync_web_manifest.py --check   # проверить синхронность (код 1 при расхождении)
"""

import filecmp
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "mcp", "mcp.json")
DST = os.path.join(ROOT, "web", "public", "mcp.json")


def main() -> int:
    check = "--check" in sys.argv
    if check:
        ok = os.path.exists(SRC) and os.path.exists(DST) and filecmp.cmp(SRC, DST, shallow=False)
        if not ok:
            sys.stderr.write("mcp.json рассинхронизирован: выполните python3 mcp/sync_web_manifest.py\n")
        return 0 if ok else 1
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(SRC, "rb") as src, open(DST, "wb") as dst:
        dst.write(src.read())
    print(f"Синхронизировано: {os.path.relpath(SRC, ROOT)} -> {os.path.relpath(DST, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
