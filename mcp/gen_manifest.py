#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Генерирует mcp/mcp.json из единого реестра инструментов mcp/server.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json

from mcp.server import build_manifest

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = os.path.join("mcp", "mcp.json")
    with open(os.path.join(root, target), "w", encoding="utf-8") as f:
        f.write(json.dumps(build_manifest(), ensure_ascii=False, indent=2) + "\n")
    print(f"Манифест обновлён: {target}")
