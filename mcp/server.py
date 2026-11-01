# SPDX-License-Identifier: GPL-3.0-or-later
"""MCP сервер ClassConfig: JSON-RPC 2.0 поверх stdio и Streamable HTTP.

Соответствует спецификации Model Context Protocol (protocolVersion 2025-06-18,
обратная совместимость с 2024-11-05). Только стандартная библиотека Python.

Запуск:
    python3 -m mcp                        # stdio (Claude Desktop, Cursor, ...)
    python3 -m mcp --transport http       # Streamable HTTP на http://127.0.0.1:8765/mcp
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional, Tuple

# Allow running from any CWD (client configs may not set PYTHONPATH).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from classconfig import __version__ as SERVER_VERSION
from classconfig.compare import compare_source_with_baseline
from classconfig.errors import ClassConfigError, ErrorCode
from classconfig.generator import generate_user_guide, save_guide_file
from classconfig.limits import (
    CONTEXT_LINES,
    ENCODING,
    FILES_DIR,
    MANIFEST_NAME,
    MANIFEST_VERSION,
    MAX_FILE_BYTES,
    MAX_FILES,
)
from classconfig.report import generate_html_report, write_html_report_atomically
from classconfig.snapshot import create_snapshot, get_current_iso_timestamp
from classconfig.validate import inspect_source_folder, normalize_path

SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]
SERVER_NAME = "classconfig-mcp-server"

# --- Реестр инструментов (единый источник истины для mcp.json) --------------


def _tool(
    name: str,
    title: str,
    description: str,
    properties: Dict[str, Any],
    required: List[str],
    annotations: Dict[str, bool],
) -> Dict[str, Any]:
    return {
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
        "annotations": annotations,
    }


TOOLS: List[Dict[str, Any]] = [
    _tool(
        "classconfig_snapshot",
        "Создание эталона",
        "Атомарно сохраняет эталонный снимок плоской папки текстовых конфигураций "
        "(до 20 файлов, до 1 МиБ каждый, UTF-8): копирует файлы в baseline/files/ "
        "и записывает manifest.json с SHA-256.",
        {
            "source": {"type": "string", "description": "Путь к папке-источнику конфигураций"},
            "baseline": {"type": "string", "description": "Путь к создаваемому каталогу эталона (не должен существовать)"},
        },
        ["source", "baseline"],
        {"title": "Создание эталона", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False},
    ),
    _tool(
        "classconfig_check",
        "Проверка с эталоном",
        "Сравнивает папку с эталоном, генерирует автономный HTML-отчёт и возвращает "
        "счётчики (changed/added/deleted/unchanged) и пофайловые статусы. "
        "exit_code: 0 — отличий нет, 1 — отличия найдены (штатный успех), 2 — ошибка.",
        {
            "source": {"type": "string", "description": "Путь к проверяемой папке"},
            "baseline": {"type": "string", "description": "Путь к каталогу эталона"},
            "report": {"type": "string", "description": "Путь к создаваемому HTML-файлу отчёта"},
            "include_report_html": {
                "type": "boolean",
                "description": "Вернуть полный HTML отчёта в structuredContent (по умолчанию false)",
                "default": False,
            },
        },
        ["source", "baseline", "report"],
        {"title": "Проверка с эталоном", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    ),
    _tool(
        "classconfig_validate",
        "Валидация папки",
        "Проверяет папку на архитектурные лимиты ClassConfig: не более 20 файлов, "
        "не более 1 МиБ на файл, только текст UTF-8 без NUL, без симлинков и подкаталогов.",
        {
            "source": {"type": "string", "description": "Путь к проверяемой папке"},
        },
        ["source"],
        {"title": "Валидация папки", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    ),
    _tool(
        "classconfig_generate_guide",
        "Генерация руководства",
        "Автоматически формирует актуальный документ «docs/GUIDE.md» "
        "(руководство пользователя) с параметрами проекта.",
        {
            "project_name": {"type": "string", "default": "ClassConfig"},
            "demo_url": {"type": "string", "default": "https://ferrovovan.github.io/classconfig"},
            "repo_url": {"type": "string", "default": "https://github.com/ferrovovan/classconfig"},
            "output_path": {"type": "string", "description": "Куда записать .md (по умолчанию docs/GUIDE.md)"},
        },
        [],
        {"title": "Генерация руководства", "readOnlyHint": False, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    ),
    _tool(
        "classconfig_get_limits",
        "Лимиты и коды ошибок",
        "Возвращает неизменяемые архитектурные лимиты, константы манифеста, коды возврата "
        "и все 17 кодов ошибок ClassConfig.",
        {},
        [],
        {"title": "Лимиты и коды ошибок", "readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
    ),
]


def build_manifest() -> Dict[str, Any]:
    """Собирает манифест MCP-сервера (содержимое mcp/mcp.json)."""
    return {
        "name": SERVER_NAME,
        "version": SERVER_VERSION,
        "description": "Model Context Protocol (MCP) Server for ClassConfig - snapshot, check, and configuration audit tool",
        "protocolVersion": SUPPORTED_PROTOCOL_VERSIONS[0],
        "supportedProtocolVersions": SUPPORTED_PROTOCOL_VERSIONS,
        "capabilities": {
            "tools": {"listChanged": False},
            "resources": {},
            "prompts": {},
        },
        "tools": TOOLS,
    }


# --- Реализации инструментов --------------------------------------------------


def _tool_snapshot(args: Dict[str, Any]) -> Dict[str, Any]:
    source = str(args["source"])
    baseline = str(args["baseline"])
    with contextlib.redirect_stdout(io.StringIO()):
        manifest = create_snapshot(source, baseline)
    return {
        "exit_code": 0,
        "baseline": baseline,
        "files_count": len(manifest.files),
        "created_at": manifest.created_at,
        "files": manifest.to_dict()["files"],
    }


def _tool_check(args: Dict[str, Any]) -> Dict[str, Any]:
    source = str(args["source"])
    baseline = str(args["baseline"])
    report = str(args["report"])
    result = compare_source_with_baseline(source, baseline)
    html = generate_html_report(result)
    write_html_report_atomically(report, html)
    structured: Dict[str, Any] = {
        "exit_code": 1 if result.has_differences else 0,
        "changed": result.count_changed,
        "added": result.count_added,
        "deleted": result.count_deleted,
        "unchanged": result.count_unchanged,
        "report": report,
        "checked_at": result.checked_at,
        "files": [{"name": f.name, "status": f.status} for f in result.files],
    }
    if args.get("include_report_html"):
        structured["report_html"] = html
    return structured


def _tool_validate(args: Dict[str, Any]) -> Dict[str, Any]:
    source = str(args["source"])
    if not os.path.isdir(source):
        return {"valid": False, "error": f"SOURCE_NOT_FOUND: папка не найдена: {source}"}
    try:
        valid_files = inspect_source_folder(source)
    except ClassConfigError as exc:
        return {"valid": False, "errors": [e.format_line() for e in exc.errors]}
    return {
        "valid": True,
        "files_count": len(valid_files),
        "files": [{"name": f.name, "size_bytes": f.size_bytes, "sha256": f.sha256} for f in valid_files],
    }


def _tool_generate_guide(args: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {
        "project_name", "project_subtitle", "demo_url", "repo_url",
        "target_audience", "core_purpose", "time_to_value",
    }
    params = {k: str(v) for k, v in args.items() if k in allowed}
    output = str(args.get("output_path", os.path.join("docs", "GUIDE.md")))
    saved = save_guide_file(output, params or None)
    return {"success": True, "file": saved}


def _tool_get_limits(_: Dict[str, Any]) -> Dict[str, Any]:
    error_codes = sorted(
        v for k, v in vars(ErrorCode).items() if not k.startswith("_") and isinstance(v, str)
    )
    return {
        "limits": {
            "MAX_FILES": MAX_FILES,
            "MAX_FILE_BYTES": MAX_FILE_BYTES,
            "ENCODING": ENCODING,
            "MANIFEST_VERSION": MANIFEST_VERSION,
            "MANIFEST_NAME": MANIFEST_NAME,
            "FILES_DIR": FILES_DIR,
            "CONTEXT_LINES": CONTEXT_LINES,
        },
        "exit_codes": {
            "0": "Success (No differences or snapshot created)",
            "1": "Success with differences found (Normal audit outcome)",
            "2": "Error occurred (Validation or disk failure)",
        },
        "error_codes": error_codes,
    }


TOOL_IMPLS: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "classconfig_snapshot": _tool_snapshot,
    "classconfig_check": _tool_check,
    "classconfig_validate": _tool_validate,
    "classconfig_generate_guide": _tool_generate_guide,
    "classconfig_get_limits": _tool_get_limits,
}

# --- JSON-RPC 2.0 / MCP обработчик --------------------------------------------

JSONRPC_PARSE_ERROR = -32700
JSONRPC_INVALID_REQUEST = -32600
JSONRPC_METHOD_NOT_FOUND = -32601
JSONRPC_INVALID_PARAMS = -32602
JSONRPC_INTERNAL_ERROR = -32603

_SERVER_INSTRUCTIONS = (
    "ClassConfig: tools snapshot/check operate on the LOCAL FILESYSTEM of the machine "
    "running this server. Exit code 1 from check is a normal audit outcome (differences "
    "found), not an error."
)


def _result(msg_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": msg_id, "error": err}


def _call_tool(params: Dict[str, Any]) -> Dict[str, Any]:
    name = params.get("name")
    if name not in TOOL_IMPLS:
        raise _McpCallError(JSONRPC_INVALID_PARAMS, f"Unknown tool: {name!r}")
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        raise _McpCallError(JSONRPC_INVALID_PARAMS, "'arguments' must be an object")
    schema = next(t["inputSchema"] for t in TOOLS if t["name"] == name)
    missing = [k for k in schema.get("required", []) if k not in args]
    if missing:
        return {
            "content": [{"type": "text", "text": f"classconfig: error: INVALID_ARGUMENTS: пропущен обязательный параметр --{missing[0]}"}],
            "structuredContent": {"exit_code": 2, "errors": [f"INVALID_ARGUMENTS: missing {missing}"]},
            "isError": True,
        }
    try:
        structured = TOOL_IMPLS[name](args)
        lines = [json.dumps(structured, ensure_ascii=False, indent=2)]
        return {
            "content": [{"type": "text", "text": lines[0]}],
            "structuredContent": structured,
            "isError": False,
        }
    except ClassConfigError as exc:
        messages = [e.format_line() for e in exc.errors]
        structured = {"exit_code": 2, "errors": messages}
        return {
            "content": [{"type": "text", "text": "\n".join(messages)}],
            "structuredContent": structured,
            "isError": True,
        }
    except KeyError as exc:
        raise _McpCallError(JSONRPC_INVALID_PARAMS, f"Missing required argument: {exc}") from exc
    except (TypeError, ValueError) as exc:
        return {
            "content": [{"type": "text", "text": f"classconfig: error: WRITE_ERROR: {exc}"}],
            "structuredContent": {"exit_code": 2, "errors": [str(exc)]},
            "isError": True,
        }


class _McpCallError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def handle_message(msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Обрабатывает одно JSON-RPC сообщение MCP. None — нет ответа (notification)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return _error(msg.get("id") if isinstance(msg, dict) else None, JSONRPC_INVALID_REQUEST, "Invalid Request")

    method = msg["method"]
    msg_id = msg.get("id")
    params = msg.get("params") or {}
    is_request = "id" in msg

    try:
        if method == "initialize":
            requested = params.get("protocolVersion")
            negotiated = requested if requested in SUPPORTED_PROTOCOL_VERSIONS else SUPPORTED_PROTOCOL_VERSIONS[0]
            result = _INIT_RESULT.copy()
            result["protocolVersion"] = negotiated
            return _result(msg_id, result) if is_request else None
        if method == "notifications/initialized":
            return None
        if method == "ping":
            return _result(msg_id, {}) if is_request else None
        if method == "tools/list":
            return _result(msg_id, {"tools": TOOLS}) if is_request else None
        if method == "tools/call":
            if not is_request:
                return None
            return _result(msg_id, _call_tool(params))
        if method in ("resources/list", "prompts/list"):
            key = method.split("/")[0]
            return _result(msg_id, {key: []}) if is_request else None
        if is_request:
            return _error(msg_id, JSONRPC_METHOD_NOT_FOUND, f"Method not found: {method}")
        return None
    except _McpCallError as exc:
        return _error(msg_id, exc.code, exc.message)
    except Exception as exc:  # noqa: BLE001 — JSON-RPC internal error
        return _error(msg_id, JSONRPC_INTERNAL_ERROR, f"Internal error: {exc}")


_INIT_RESULT: Dict[str, Any] = {
    "protocolVersion": SUPPORTED_PROTOCOL_VERSIONS[0],
    "capabilities": {"tools": {"listChanged": False}, "resources": {}, "prompts": {}},
    "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION, "title": "ClassConfig MCP"},
    "instructions": _SERVER_INSTRUCTIONS,
}


def _process_raw(raw: str) -> Optional[str]:
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return json.dumps(_error(None, JSONRPC_PARSE_ERROR, "Parse error"), ensure_ascii=False)
    reply = handle_message(msg)
    if reply is None:
        return None
    return json.dumps(reply, ensure_ascii=False)


# --- Транспорт: stdio ----------------------------------------------------------


def run_stdio() -> None:
    """Line-delimited JSON-RPC поверх stdin/stdout (стандарт для desktop-клиентов)."""
    stdin = sys.stdin
    stdout = sys.stdout
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        reply = _process_raw(line)
        if reply is not None:
            stdout.write(reply + "\n")
            stdout.flush()


# --- Транспорт: Streamable HTTP --------------------------------------------------


class _HttpHandler(BaseHTTPRequestHandler):
    server_version = f"{SERVER_NAME}/{SERVER_VERSION}"

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, body: str, status: int = 200) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path in ("/mcp.json", "/.well-known/mcp.json"):
            self._send_json(json.dumps(build_manifest(), ensure_ascii=False, indent=2))
        else:
            self.send_response(405)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Use POST /mcp for JSON-RPC"}).encode())

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        if path != "/mcp":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        reply = _process_raw(raw)
        if reply is None:
            self.send_response(202)
            self._cors()
            self.end_headers()
            return
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(reply.encode("utf-8"))

    def log_message(self, fmt: str, *args: Any) -> None:  # тихий лог в stderr
        sys.stderr.write("[mcp-http] " + (fmt % args) + "\n")


def run_http(host: str = "127.0.0.1", port: int = 8765, quiet: bool = False) -> Tuple[str, int]:
    """Запускает Streamable HTTP сервер; возвращает фактические (host, port)."""
    httpd = ThreadingHTTPServer((host, port), _HttpHandler)
    actual_host, actual_port = httpd.server_address[0], httpd.server_address[1]
    if not quiet:
        sys.stderr.write(f"[mcp-http] ClassConfig MCP listening on http://{actual_host}:{actual_port}/mcp\n")
        sys.stderr.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return actual_host, actual_port


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m mcp", description="ClassConfig MCP Server (stdio / Streamable HTTP)")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765, help="0 — случайный свободный порт")
    parser.add_argument("--manifest", action="store_true", help="напечатать mcp.json и выйти")
    ns = parser.parse_args(argv)

    if ns.manifest:
        sys.stdout.write(json.dumps(build_manifest(), ensure_ascii=False, indent=2) + "\n")
        return 0
    if ns.transport == "http":
        run_http(ns.host, ns.port)
        return 0
    run_stdio()
    return 0


if __name__ == "__main__":
    sys.exit(main())
