import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../static/', import.meta.url));
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('平台必须分配有效 PORT');
const prefix = String(process.env.NEXT_PUBLIC_COURSE_BASE_PATH || '').replace(/\/$/, '');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.onnx':'application/octet-stream', '.css':'text/css; charset=utf-8' };
createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) pathname = pathname.slice(prefix.length) || '/';
    if (pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(resolve(root) + sep)) throw new Error('forbidden');
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, process.env.HOST || '127.0.0.1', () => console.info('courseware ready'));
