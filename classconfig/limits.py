# SPDX-License-Identifier: GPL-3.0-or-later
"""Неизменяемые пределы и постоянные параметры ClassConfig.

Архитектурные константы продукта:
- MAX_FILES = 20
- MAX_FILE_BYTES = 1048576 (1 МиБ)
- ENCODING = "utf-8"
- MANIFEST_VERSION = 1
- MANIFEST_NAME = "manifest.json"
- FILES_DIR = "files"
- CONTEXT_LINES = 3 (контекст равных строк в отчёте)
"""

MAX_FILES: int = 20
MAX_FILE_BYTES: int = 1_048_576  # 1 MiB
ENCODING: str = "utf-8"
MANIFEST_VERSION: int = 1
MANIFEST_NAME: str = "manifest.json"
FILES_DIR: str = "files"
CONTEXT_LINES: int = 3
