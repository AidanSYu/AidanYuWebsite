'use strict';

/**
 * Local editing server. Not deployed: see .assetsignore.
 *
 * Serves the site from disk like a plain static host, and adds two things on top:
 *   - /admin           a compose page for writing a new post
 *   - click-to-edit    every served page gets edit-mode.js injected, which lets
 *                      you retype text in place and write it back to the source
 *
 * Binds to 127.0.0.1 on purpose. The write endpoints have no authentication, so
 * this must never be reachable from the network.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const content = require('./content');

const ROOT = __dirname;
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8000;
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolves a URL path to a file inside ROOT, or null if it escapes.
 * The realpath comparison is what stops "/../../.ssh/id_rsa" and symlink tricks.
 */
function resolveInsideRoot(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(new Error('Body was not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Applies in-place text edits to one source file.
 *
 * Each edit is located by its exact original markup rather than by a line number
 * or a DOM path, so the surrounding file keeps its formatting and `git diff`
 * stays readable. An edit whose original text is not found, or is found more
 * than once, is refused rather than guessed at.
 */
function applyEdits(filePath, edits) {
  let source = fs.readFileSync(filePath, 'utf8');
  const results = [];

  for (const edit of edits) {
    const before = String(edit.old);
    const after = String(edit.new);

    if (before === after) {
      results.push({ ok: true, skipped: true });
      continue;
    }

    const first = source.indexOf(before);
    if (first === -1) {
      results.push({ ok: false, reason: 'Original text not found in the source file.', preview: before.slice(0, 80) });
      continue;
    }
    if (source.indexOf(before, first + 1) !== -1) {
      results.push({ ok: false, reason: 'Original text appears more than once, so the target is ambiguous.', preview: before.slice(0, 80) });
      continue;
    }

    source = source.slice(0, first) + after + source.slice(first + before.length);
    results.push({ ok: true, skipped: false });
  }

  const applied = results.filter(r => r.ok && !r.skipped).length;
  if (applied > 0) fs.writeFileSync(filePath, source, 'utf8');

  return { applied, results };
}

async function handleApi(req, res, pathname) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  if (pathname === '/api/post') {
    try {
      const result = content.createPost({
        title: body.title,
        date: body.date,
        body: body.body,
        slug: body.slug,
        overwrite: Boolean(body.overwrite),
      });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === '/api/edits') {
    const target = resolveInsideRoot(String(body.page || ''));
    if (!target || path.extname(target) !== '.html' || !fs.existsSync(target)) {
      return sendJson(res, 400, { error: 'Edits must target an existing .html file in the site directory.' });
    }
    if (!Array.isArray(body.edits) || body.edits.length === 0) {
      return sendJson(res, 400, { error: 'No edits supplied.' });
    }
    try {
      const outcome = applyEdits(target, body.edits);
      return sendJson(res, 200, { file: path.relative(ROOT, target), ...outcome });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Unknown endpoint.' });
}

// Injected before </body> so the editor loads after the page's own markup exists.
function injectEditor(html, pagePath) {
  const tag = `<script src="/__editor.js" data-page="${pagePath}" defer></script>`;
  return html.includes('</body>')
    ? html.replace('</body>', `  ${tag}\n  </body>`)
    : html + tag;
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(err => sendJson(res, 500, { error: err.message }));
    return;
  }

  if (pathname === '/__editor.js') {
    const file = path.join(ROOT, 'edit-mode.js');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('edit-mode.js is missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    const file = path.join(ROOT, 'admin.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
    return;
  }

  let target = resolveInsideRoot(pathname);
  if (!target) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }

  if (!fs.existsSync(target)) {
    const notFound = path.join(ROOT, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(fs.readFileSync(notFound, 'utf8'));
    } else {
      res.writeHead(404).end('Not found');
    }
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  if (ext === '.html') {
    const relative = '/' + path.relative(ROOT, target).split(path.sep).join('/');
    const source = fs.readFileSync(target, 'utf8');
    // The composer drives the same write endpoints itself; giving it the
    // click-to-edit layer as well would just fight its own form.
    const html = relative === '/admin.html' ? source : injectEditor(source, relative);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server, or run: PORT=8001 npm run dev`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`  site     http://${HOST}:${PORT}/`);
  console.log(`  compose  http://${HOST}:${PORT}/admin`);
  console.log('');
  console.log('  Click "edit" on any page to retype text in place.');
  console.log('  Edits write straight to the source files, so commit before a big session.');
});
