import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import marimo as mo


class BridgeState:
    def __init__(self) -> None:
        self._lock: threading.Lock = threading.Lock()
        self.selection: dict[str, Any] = {
            "type": "interval",
            "active": False,
            "intervals": {"x": None},
        }
        self.annotations: list[dict[str, Any]] = []

    def get_selection(self) -> dict[str, Any]:
        with self._lock:
            return self.selection

    def set_selection(self, value: dict[str, Any]) -> None:
        with self._lock:
            self.selection = value

    def get_annotations(self) -> list[dict[str, Any]]:
        with self._lock:
            return self.annotations

    def set_annotations(self, value: list[dict[str, Any]]) -> None:
        with self._lock:
            self.annotations = value


def make_handler(state: BridgeState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, value: Any) -> None:
            body = json.dumps(value).encode("utf-8")
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:4173")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:4173")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            if self.path == "/selection":
                self._send_json(state.get_selection())
            elif self.path == "/annotations":
                self._send_json(state.get_annotations())
            else:
                self.send_error(404)

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length", "0"))
            value = json.loads(self.rfile.read(length))
            if self.path == "/selection":
                state.set_selection(value)
            elif self.path == "/annotations" and isinstance(value, list):
                state.set_annotations(value)
            else:
                self.send_error(404)
                return
            self._send_json({"ok": True})

        def log_message(self, *_args: object) -> None:
            pass

    return Handler


app = mo.App()


@app.cell
def _():
    state = BridgeState()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), make_handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return state, server


@app.cell
def _(state):
    refresh = mo.ui.button(label="Refresh selection")
    rows = mo.ui.text_area(
        label="Annotation rows (JSON)",
        value="[]",
        rows=8,
    )
    publish = mo.ui.button(label="Publish rows")
    refresh.value
    selection = state.get_selection()
    if publish.value:
        state.set_annotations(json.loads(rows.value))
    return mo.vstack([refresh, mo.md(f"Latest selection:\n```json\n{json.dumps(selection, indent=2)}\n```"), rows, publish])


if __name__ == "__main__":
    app.run()
