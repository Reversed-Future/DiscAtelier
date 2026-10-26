"""Serve only this workspace on an ephemeral loopback port; no external dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.ateliermodel': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root))) as server:
        print(f'http://127.0.0.1:{server.server_port}/index.html', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
