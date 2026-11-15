#!/usr/bin/env python3
"""Chrono local server (Python, stdlib only). Same features as tools/server.js:
static files, encrypted-sync storage (/sync/<room>), same-machine pairing (/sync-code), LLM proxy (/proxy).
Usage: python tools/server.py [port]"""
import http.server, socketserver, json, os, re, sys, secrets, urllib.request, urllib.error, urllib.parse, time, socket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sync-data')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS'}
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8'}
BLOCK = re.compile(r'[\\/](tests|tools|node_modules|\.git|sync-data)([\\/]|$)')


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'Chrono'

    def log_message(self, *a):
        pass

    def send(self, code, body=b'', ctype='application/json', extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        for k, v in CORS.items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def body(self, limit=20 * 1024 * 1024):
        n = int(self.headers.get('Content-Length') or 0)
        if n > limit:
            return None
        return self.rfile.read(n)

    def do_OPTIONS(self):
        self.send(204)

    def is_local(self):
        return self.client_address[0] in ('127.0.0.1', '::1', '::ffff:127.0.0.1')

    def route(self):
        u = urllib.parse.urlparse(self.path)
        p = urllib.parse.unquote(u.path)
        if p == '/sync-code':
            if not self.is_local():
                return self.send(403, '{"error":"local only"}')
            os.makedirs(DATA, exist_ok=True)
            f = os.path.join(DATA, '.code')
            try:
                code = open(f, encoding='utf-8').read().strip()
            except OSError:
                code = ''.join(secrets.choice('abcdefghjkmnpqrstuvwxyz23456789') for _ in range(18))
                open(f, 'w', encoding='utf-8').write(code)
            return self.send(200, json.dumps({'code': code}))
        if p.startswith('/sync/'):
            m = re.fullmatch(r'/sync/([a-f0-9]{64})', p)
            if not m:
                return self.send(404, '{"error":"not found"}')
            os.makedirs(DATA, exist_ok=True)
            f = os.path.join(DATA, m.group(1) + '.json')

            def cur():
                try:
                    return json.load(open(f, encoding='utf-8'))
                except (OSError, ValueError):
                    return None
            if self.command == 'GET':
                v = cur()
                return self.send(200 if v else 404, json.dumps(v or {'error': 'empty'}))
            if self.command == 'DELETE':
                try:
                    os.remove(f)
                except OSError:
                    pass
                return self.send(200, '{"ok":true}')
            if self.command == 'PUT':
                raw = self.body()
                try:
                    b = json.loads(raw)
                    assert isinstance(b.get('blob'), str)
                except Exception:
                    return self.send(400, '{"error":"bad body"}')
                v = cur()
                rev = v['rev'] if v else 0
                if int(b.get('rev') or 0) != rev:
                    return self.send(409, json.dumps({'error': 'conflict', 'rev': rev}))
                nxt = {'rev': rev + 1, 'blob': b['blob'], 't': int(time.time() * 1000)}
                json.dump(nxt, open(f, 'w', encoding='utf-8'))
                return self.send(200, json.dumps({'rev': nxt['rev']}))
            return self.send(405, '{"error":"method"}')
        if p == '/proxy':
            if self.command != 'POST':
                return self.send(405, '{"error":"method"}')
            target = self.headers.get('x-target-url') or ''
            if not re.match(r'^https?://', target):
                return self.send(400, 'bad x-target-url', 'text/plain')
            data = self.body()
            hdr = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'origin', 'referer', 'x-target-url', 'content-length', 'connection', 'accept-encoding')}
            req = urllib.request.Request(target, data=data, headers=hdr, method='POST')
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    return self.send(r.status, r.read(), r.headers.get('Content-Type', 'application/json'))
            except urllib.error.HTTPError as e:
                return self.send(e.code, e.read(), e.headers.get('Content-Type', 'application/json'))
            except Exception as e:
                return self.send(502, 'proxy error: ' + str(e), 'text/plain')
        # static
        if self.command not in ('GET', 'HEAD'):
            return self.send(405, '{"error":"method"}')
        if p == '/':
            p = '/index.html'
        f = os.path.normpath(os.path.join(ROOT, p.lstrip('/\\')))
        if not f.startswith(ROOT) or BLOCK.search(f):
            return self.send(403, 'forbidden', 'text/plain')
        try:
            data = open(f, 'rb').read()
        except OSError:
            return self.send(404, 'not found', 'text/plain')
        return self.send(200, data, MIME.get(os.path.splitext(f)[1], 'application/octet-stream'))

    do_GET = do_HEAD = do_PUT = do_POST = do_DELETE = route


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    address_family = socket.AF_INET


if __name__ == '__main__':
    try:
        srv = S(('0.0.0.0', PORT), H)
    except OSError as e:
        print('Cannot start on port %d: %s' % (PORT, e))
        sys.exit(1)
    print('\n  Chrono is running:  http://localhost:%d' % PORT)
    try:
        ip = socket.gethostbyname(socket.gethostname())
        print('  Phone on same Wi-Fi: http://%s:%d' % (ip, PORT))
    except Exception:
        pass
    print('  Press Ctrl+C to stop.\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
