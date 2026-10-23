const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', 'integrations', 'word');
const port = Number(process.env.PORT || 3000);
const certDir = process.env.OFFICE_ADDIN_CERTS || path.join(os.homedir(), '.office-addin-dev-certs');
const certPath = path.join(certDir, 'localhost.crt');
const keyPath = path.join(certDir, 'localhost.key');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('Certificado local não encontrado.');
  console.error('Execute primeiro: npx office-addin-dev-certs install');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

const server = https.createServer(
  { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
  (req, res) => {
    try {
      const url = new URL(req.url, `https://localhost:${port}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/taskpane.html';
      const filePath = path.resolve(root, `.${pathname}`);
      if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
        send(res, 403, 'Forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        send(res, 404, 'Not found');
        return;
      }
      send(res, 200, fs.readFileSync(filePath), types[path.extname(filePath)] || 'application/octet-stream');
    } catch (error) {
      send(res, 500, `Erro: ${error.message}`);
    }
  }
);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso. Use PORT=3001 npm run word:serve.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Painel do Word: https://localhost:${port}/taskpane.html?demo=1`);
  console.log(`Manifest local: ${path.join(root, 'manifest.localhost.xml')}`);
  console.log('Copie o manifest para a pasta wef do Word e reinicie o Word.');
});
