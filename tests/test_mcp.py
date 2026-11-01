# SPDX-License-Identifier: GPL-3.0-or-later
"""Тесты MCP-развёртывания: манифест, JSON-RPC обработчик, транспорты stdio и HTTP."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from mcp.server import TOOLS, TOOL_IMPLS, build_manifest, handle_message  # noqa: E402

DEMO_FILES = ["app.ini", "cache.conf", "display.conf", "logging.conf", "network.conf"]


def rpc(msg: dict) -> dict | None:
    return handle_message(msg)


class ManifestTests(unittest.TestCase):
    def test_manifest_file_in_sync_with_registry(self):
        with open(os.path.join(ROOT, "mcp", "mcp.json"), encoding="utf-8") as f:
            on_disk = json.load(f)
        self.assertEqual(on_disk, build_manifest())

    def test_web_public_manifest_in_sync(self):
        src = os.path.join(ROOT, "mcp", "mcp.json")
        dst = os.path.join(ROOT, "web", "public", "mcp.json")
        self.assertTrue(os.path.exists(dst), "выполните python3 mcp/sync_web_manifest.py")
        with open(src, "rb") as a, open(dst, "rb") as b:
            self.assertEqual(a.read(), b.read())

    def test_manifest_schema(self):
        m = build_manifest()
        self.assertEqual(m["name"], "classconfig-mcp-server")
        self.assertEqual(m["protocolVersion"], "2025-06-18")
        self.assertIn("2024-11-05", m["supportedProtocolVersions"])
        self.assertEqual(len(m["tools"]), 5)
        for t in m["tools"]:
            self.assertIn(t["name"], TOOL_IMPLS)
            self.assertEqual(t["inputSchema"]["type"], "object")
            self.assertIn("annotations", t)
        self.assertEqual(
            sorted(t["name"] for t in m["tools"]),
            [
                "classconfig_check",
                "classconfig_generate_guide",
                "classconfig_get_limits",
                "classconfig_snapshot",
                "classconfig_validate",
            ],
        )


class ProtocolTests(unittest.TestCase):
    def test_initialize_negotiation(self):
        r = rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                 "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                            "clientInfo": {"name": "t", "version": "0"}}})
        self.assertEqual(r["id"], 1)
        self.assertEqual(r["result"]["protocolVersion"], "2024-11-05")
        self.assertIn("serverInfo", r["result"])
        r2 = rpc({"jsonrpc": "2.0", "id": 2, "method": "initialize",
                  "params": {"protocolVersion": "1999-01-01"}})
        self.assertEqual(r2["result"]["protocolVersion"], "2025-06-18")

    def test_notification_has_no_reply(self):
        self.assertIsNone(rpc({"jsonrpc": "2.0", "method": "notifications/initialized"}))

    def test_ping_and_lists(self):
        self.assertEqual(rpc({"jsonrpc": "2.0", "id": 3, "method": "ping"})["result"], {})
        self.assertEqual(len(rpc({"jsonrpc": "2.0", "id": 4, "method": "tools/list"})["result"]["tools"]), 5)
        self.assertEqual(rpc({"jsonrpc": "2.0", "id": 5, "method": "resources/list"})["result"], {"resources": []})

    def test_unknown_method_and_bad_request(self):
        self.assertEqual(rpc({"jsonrpc": "2.0", "id": 6, "method": "x/y"})["error"]["code"], -32601)
        self.assertEqual(rpc({"jsonrpc": "1.0", "id": 7, "method": "ping"})["error"]["code"], -32600)

    def test_unknown_tool_is_jsonrpc_error(self):
        r = rpc({"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "nope"}})
        self.assertEqual(r["error"]["code"], -32602)

    def test_missing_argument_is_error_result(self):
        r = rpc({"jsonrpc": "2.0", "id": 9, "method": "tools/call",
                 "params": {"name": "classconfig_snapshot", "arguments": {}}})
        self.assertTrue(r["result"]["isError"])


class StdioToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mcp_test_")
        self.src = os.path.join(self.tmp, "config")
        shutil.copytree(os.path.join(ROOT, "demo", "config"), self.src)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _call(self, name: str, args: dict) -> dict:
        r = rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                 "params": {"name": name, "arguments": args}})
        return r["result"]

    def test_snapshot_then_check_flow(self):
        base = os.path.join(self.tmp, "baseline")
        res = self._call("classconfig_snapshot", {"source": self.src, "baseline": base})
        self.assertFalse(res["isError"])
        self.assertEqual(res["structuredContent"]["files_count"], 5)
        self.assertTrue(os.path.isfile(os.path.join(base, "manifest.json")))
        self.assertEqual(len(os.listdir(os.path.join(base, "files"))), 5)

        report = os.path.join(self.tmp, "report.html")
        res = self._call("classconfig_check", {"source": self.src, "baseline": base, "report": report})
        self.assertEqual(res["structuredContent"]["exit_code"], 0)
        self.assertTrue(os.path.isfile(report))

        with open(os.path.join(self.src, "app.ini"), encoding="utf-8") as f:
            data = f.read()
        with open(os.path.join(self.src, "app.ini"), "w", encoding="utf-8") as f:
            f.write(data.replace("PORT=5432", "PORT=5433"))
        res = self._call("classconfig_check", {"source": self.src, "baseline": base, "report": report})
        self.assertEqual(res["structuredContent"]["exit_code"], 1)
        self.assertEqual(res["structuredContent"]["changed"], 1)

    def test_snapshot_baseline_exists_is_tool_error(self):
        base = os.path.join(self.tmp, "baseline")
        self._call("classconfig_snapshot", {"source": self.src, "baseline": base})
        res = self._call("classconfig_snapshot", {"source": self.src, "baseline": base})
        self.assertTrue(res["isError"])
        self.assertEqual(res["structuredContent"]["exit_code"], 2)

    def test_validate(self):
        res = self._call("classconfig_validate", {"source": self.src})
        self.assertFalse(res["isError"])
        self.assertEqual(res["structuredContent"]["files_count"], 5)
        res = self._call("classconfig_validate", {"source": os.path.join(self.tmp, "nope")})
        self.assertFalse(res["isError"])
        self.assertFalse(res["structuredContent"]["valid"])


class StdioTransportTests(unittest.TestCase):
    def test_line_delimited_handshake(self):
        msgs = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                        "clientInfo": {"name": "t", "version": "0"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        ]
        payload = "".join(json.dumps(m) + "\n" for m in msgs)
        proc = subprocess.run(
            [sys.executable, "-m", "mcp"],
            input=payload, capture_output=True, text=True, cwd=ROOT, timeout=30,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        replies = [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]
        self.assertEqual(len(replies), 2)  # notification без ответа
        self.assertEqual(replies[0]["id"], 1)
        self.assertEqual(len(replies[1]["result"]["tools"]), 5)


class HttpTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc = subprocess.Popen(
            [sys.executable, "-m", "mcp", "--transport", "http", "--host", "127.0.0.1", "--port", "0"],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        line = cls.proc.stderr.readline()  # "[mcp-http] ClassConfig MCP listening on http://127.0.0.1:PORT/mcp"
        for _ in range(100):
            if "listening on" in line:
                break
            line = cls.proc.stderr.readline()
        cls.base = line.rsplit("listening on ", 1)[-1].strip().removesuffix("/mcp")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.proc.kill()

    def _post(self, msg: dict) -> tuple[int, str]:
        req = urllib.request.Request(
            self.base + "/mcp",
            data=json.dumps(msg).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, resp.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def test_initialize_and_tools(self):
        status, body = self._post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                   "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                              "clientInfo": {"name": "t", "version": "0"}}})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["result"]["serverInfo"]["name"], "classconfig-mcp-server")
        status, body = self._post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        self.assertEqual(len(json.loads(body)["result"]["tools"]), 5)

    def test_notification_returns_202(self):
        status, _ = self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertEqual(status, 202)

    def test_manifest_over_http(self):
        with urllib.request.urlopen(self.base + "/mcp.json", timeout=10) as resp:
            data = json.load(resp)
        self.assertEqual(data, build_manifest())


if __name__ == "__main__":
    unittest.main()
