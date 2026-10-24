const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 23120;
const MAX_PORT = 23129;

const STATIC_FILES = new Map([
  ['/', { file: 'taskpane.html', type: 'text/html; charset=utf-8' }],
  ['/taskpane.html', { file: 'taskpane.html', type: 'text/html; charset=utf-8' }],
  ['/taskpane.js', { file: 'taskpane.js', type: 'text/javascript; charset=utf-8' }],
  ['/fields.js', { file: 'fields.js', type: 'text/javascript; charset=utf-8' }],
  ['/strings.js', { file: 'strings.js', type: 'text/javascript; charset=utf-8' }],
  ['/commands.html', { file: 'commands.html', type: 'text/html; charset=utf-8' }],
  ['/commands.js', { file: 'commands.js', type: 'text/javascript; charset=utf-8' }],
  ['/demo-bibliography.json', { file: 'demo-bibliography.json', type: 'application/json; charset=utf-8' }]
]);

const ASSET_PATTERN = /^\/assets\/([a-z]+)-(16|32|80)\.png$/;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true'
  };
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...corsHeaders()
  });
  res.end(payload);
}

function sendFile(res, filePath, type) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': type.startsWith('image/') ? 'max-age=300' : 'no-store'
    });
    res.end(data);
  });
}

function createConnector({
  cert,
  key,
  staticDir,
  getVersion,
  getLibraryPath,
  getPayload,
  getLanguage,
  port = DEFAULT_PORT
} = {}) {
  let server = null;
  let activePort = null;

  function handleRequest(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    let pathname = '/';
    try {
      pathname = new URL(req.url, `https://${HOST}`).pathname;
    } catch {
      sendJson(res, 400, { error: 'invalid request' });
      return;
    }

    if (pathname === '/ping') {
      sendJson(res, 200, {
        app: 'Cite',
        version: getVersion?.() || '',
        libraryPath: getLibraryPath?.() || '',
        language: getLanguage?.() === 'tet' ? 'tet' : 'pt'
      });
      return;
    }

    if (pathname === '/library') {
      Promise.resolve()
        .then(() => getPayload?.())
        .then((payload) => {
          if (!payload || !Array.isArray(payload.items)) throw new Error('library unavailable');
          sendJson(res, 200, payload);
        })
        .catch((err) => {
          console.error('Falha ao responder ao painel do Word:', err.message);
          sendJson(res, 503, { error: 'library unavailable' });
        });
      return;
    }

    const entry = STATIC_FILES.get(pathname);
    if (entry && staticDir) {
      sendFile(res, path.join(staticDir, entry.file), entry.type);
      return;
    }

    const asset = ASSET_PATTERN.exec(pathname);
    if (asset && staticDir) {
      sendFile(res, path.join(staticDir, 'assets', `${asset[1]}-${asset[2]}.png`), 'image/png');
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }

  function listenAt(candidate) {
    return new Promise((resolve, reject) => {
      const next = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, handleRequest);
      next.once('error', (err) => {
        next.close();
        reject(err);
      });
      next.listen(candidate, HOST, () => resolve(next));
    });
  }

  async function start() {
    if (server) return { port: activePort };
    if (!cert || !key) throw new Error('certificado local indisponível');
    const requested = Number(port) || DEFAULT_PORT;
    const last = Math.min(requested + (MAX_PORT - DEFAULT_PORT), 65535);
    for (let candidate = requested; candidate <= last; candidate += 1) {
      try {
        server = await listenAt(candidate);
        activePort = candidate;
        return { port: activePort };
      } catch (err) {
        if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
      }
    }
    throw new Error(`nenhuma porta livre entre ${requested} e ${last}`);
  }

  function stop() {
    if (!server) return;
    server.close();
    server = null;
    activePort = null;
  }

  return {
    start,
    stop,
    get port() {
      return activePort;
    },
    url: `https://localhost:${activePort || port}`
  };
}

module.exports = { createConnector, DEFAULT_PORT, MAX_PORT };
