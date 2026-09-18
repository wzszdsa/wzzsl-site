import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const envText = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const apiKey = process.env.OPENAI_API_KEY;
const allowedSlots = new Set(['reception', 'wash', 'care']);
const mimeTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 20000) reject(new Error('请求内容过大')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function generateImage({ prompt, slot }) {
  if (!apiKey) throw new Error('服务端未配置 OPENAI_API_KEY');
  if (!allowedSlots.has(slot)) throw new Error('无效的轮播区域');
  if (typeof prompt !== 'string' || prompt.trim().length < 8) throw new Error('提示词至少需要 8 个字符');
  if (prompt.length > 1800) throw new Error('提示词不能超过 1800 个字符');

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1536x1024', quality: 'medium', output_format: 'png' })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload && payload.error && payload.error.message ? payload.error.message : '图像生成请求失败');
  const base64 = payload && payload.data && payload.data[0] && payload.data[0].b64_json;
  if (!base64) throw new Error('图像生成接口没有返回图片');
  const filename = 'generated-' + slot + '.png';
  await fs.writeFile(path.join(root, 'assets', filename), Buffer.from(base64, 'base64'));
  return { url: '/assets/' + filename + '?t=' + Date.now(), slot };
}

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost:' + port).pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = await fs.readFile(filePath);
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/status') { sendJson(res, 200, { configured: Boolean(apiKey), model: 'gpt-image-2' }); return; }
    if (req.method === 'POST' && req.url === '/api/generate-image') { const result = await generateImage(JSON.parse(await readBody(req))); sendJson(res, 200, result); return; }
    if (req.method === 'GET' || req.method === 'HEAD') { await serveStatic(req, res); return; }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : '请求失败' }); }
});

server.listen(port, '127.0.0.1', () => { console.log('Pat Care running at http://127.0.0.1:' + port); });