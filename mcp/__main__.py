# SPDX-License-Identifier: GPL-3.0-or-later
"""Точка запуска MCP сервера: python3 -m mcp [--transport stdio|http]."""

import sys

from .server import main

if __name__ == "__main__":
    sys.exit(main())
