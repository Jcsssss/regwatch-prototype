#!/usr/bin/env python3
"""Local proxy between RegWatch and Azure OpenAI, for testing on your own machine.

Why this exists: a browser will not let a page opened from a file:// URL - or
served from github.io - call an Azure OpenAI endpoint directly unless that
endpoint answers the preflight with CORS headers, which Azure OpenAI does not do
by default. The request never leaves the browser and the error says only
"Failed to fetch". This forwards it instead, from a process that has no such
restriction, and adds the headers the browser wants to hear.

It is a testing tool. It listens on localhost only, it holds the key in an
environment variable rather than in the page, and it is not the thing to deploy:
that is the Azure Function in option 1.

    export AZURE_OPENAI_API_KEY="..."
    export AZURE_OPENAI_ENDPOINT="https://xxx.openai.azure.com"
    export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
    python3 tools/chat_proxy.py

Then in RegWatch: gear -> mode "OpenAI-compatible", endpoint
http://localhost:8787/v1, key anything (it is ignored; the real one stays here).

Reads the repository's .env (or a path given as the first argument), so the same
configuration the watch agent already uses works unchanged.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("REGWATCH_PROXY_PORT", "8787"))
API_VERSION = "2024-10-21"
MAX_BODY = 4 * 1024 * 1024


def load_env(path):
    """Read KEY=value lines, ignoring comments and surrounding quotes."""
    if not path or not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$', line)
            if not m or line.lstrip().startswith("#"):
                continue
            key, value = m.group(1), m.group(2).strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        # The page may be opened from a file:// URL, whose origin is "null".
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, api-key")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, code, payload, ctype="application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/chat/completions"):
            return self._send(404, {"error": {"message": "only /v1/chat/completions is proxied"}})

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._send(413, {"error": {"message": "body too large"}})
        raw = self.rfile.read(length)

        try:
            payload = json.loads(raw or b"{}")
        except ValueError:
            return self._send(400, {"error": {"message": "body is not JSON"}})
        # `model` is the deployment on Azure; it travels in the URL, not the body.
        payload.pop("model", None)

        url = "%s/openai/deployments/%s/chat/completions?api-version=%s" % (
            ENDPOINT.rstrip("/"), DEPLOYMENT, API_VERSION)
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "api-key": KEY})
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                self._send(200, response.read())
        except urllib.error.HTTPError as e:
            # Pass Azure's own message through: the browser needs the real reason.
            self._send(e.code, e.read() or json.dumps({"error": {"message": e.reason}}).encode())
        except Exception as e:                                  # noqa: BLE001
            self._send(502, {"error": {"message": "proxy could not reach Azure: %s" % e}})

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


if __name__ == "__main__":
    # An explicit path wins, then the repository root, then a copy beside the
    # agent. The root is where the SharePoint settings already live.
    _here = os.path.dirname(os.path.abspath(__file__))
    _root = os.path.dirname(_here)
    for _candidate in (sys.argv[1] if len(sys.argv) > 1 else None,
                       os.path.join(_root, ".env"),
                       os.path.join(_root, "agent-veille", ".env")):
        if _candidate and os.path.exists(_candidate):
            load_env(_candidate)
            print("configuration lue dans %s" % _candidate)
            break
    KEY = os.environ.get("AZURE_OPENAI_API_KEY", "")
    ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
    DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")
    missing = [n for n, v in [("AZURE_OPENAI_API_KEY", KEY),
                              ("AZURE_OPENAI_ENDPOINT", ENDPOINT),
                              ("AZURE_OPENAI_DEPLOYMENT", DEPLOYMENT)] if not v]
    if missing:
        raise SystemExit("variables manquantes : %s\n%s" % (", ".join(missing), __doc__))

    print("RegWatch chat proxy")
    print("  -> %s  (deployment %s)" % (ENDPOINT, DEPLOYMENT))
    print("  listening on http://localhost:%d/v1/chat/completions" % PORT)
    print("  in RegWatch: mode 'OpenAI-compatible', endpoint http://localhost:%d/v1" % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
