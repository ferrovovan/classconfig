#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Скрипт автоматической генерации руководства пользователя docs/GUIDE.md."""

import sys
import os

# Добавляем родительский каталог в sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from classconfig.generator import save_guide_file

if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("docs", "GUIDE.md")
    saved = save_guide_file(out_path)
    print(f"Руководство сформировано: {saved}")
