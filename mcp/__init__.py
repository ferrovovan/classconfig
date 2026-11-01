# SPDX-License-Identifier: GPL-3.0-or-later
"""Модуль развёртывания MCP (Model Context Protocol) для ClassConfig.

Единый источник истины по инструментам MCP:
- TOOLS / build_manifest() — манифест mcp/mcp.json;
- handle_message() — транспорт-независимый JSON-RPC 2.0 обработчик;
- run_stdio() / run_http() — стандартные транспорты спецификации MCP
  (stdio для desktop-клиентов, Streamable HTTP для сетевых клиентов).
"""

from .server import TOOLS, build_manifest, handle_message, run_stdio, run_http

__all__ = ["TOOLS", "build_manifest", "handle_message", "run_stdio", "run_http"]
