"""A live window onto training: the bottles, the whole brain, and the reward.

The training loop pushes a snapshot here after every pour and a page polls it.
The server runs in a daemon thread inside the training process, so there is
nothing to start separately and nothing to keep in sync.

Two endpoints, for two very different payloads. `state` is small JSON about the
game. `activity` is the raw per-neuron spike count for every drawn neuron, sent
as bytes rather than numbers because at 139,662 neurons a JSON array would cost
more to parse than the frame it is drawn in.
"""

import json
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent.parent / "dist"


class LiveState:
    def __init__(self):
        self._lock = threading.Lock()
        self._state = {}
        self._activity = b""

    def update(self, **fields):
        with self._lock:
            self._state.update(fields)

    def set_activity(self, payload):
        with self._lock:
            self._activity = payload

    def snapshot(self):
        with self._lock:
            return json.dumps(self._state)

    def activity(self):
        with self._lock:
            return self._activity


def serve(state, port=8800, root=DIST):
    root = Path(root).resolve()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, body, kind):
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = self.path.split("?")[0].rstrip("/")
            if path in ("", "/index.html"):
                path = "/train.html"
            if path == "/state":
                self.send(state.snapshot().encode(), "application/json")
                return
            if path == "/activity":
                self.send(state.activity(), "application/octet-stream")
                return
            target = (root / path.lstrip("/")).resolve()
            if not target.is_file() or root not in target.parents:
                self.send_error(404)
                return
            kind, _ = mimetypes.guess_type(target.name)
            self.send(target.read_bytes(), kind or "application/octet-stream")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
