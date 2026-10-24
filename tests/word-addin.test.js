const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { createWordAddin } = require('../word-addin');

function get(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, ...options }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  });
}

test('installs the local Word add-in and serves the pane over HTTPS', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-word-addin-'));
  const wefDir = path.join(root, 'wef');
  process.env.CITE_WORD_ADDIN_DIR = path.join(root, 'addin');
  process.env.CITE_WORD_WEF_DIR = wefDir;
  process.env.CITE_WORD_TRUST = 'skip';
  process.env.CITE_WORD_PORT = '23210';

  let language = 'pt';
  const addin = createWordAddin({
    appDataDir: root,
    wordDir: path.join(__dirname, '..', 'integrations', 'word'),
    getVersion: () => '0.2.0',
    getLibraryPath: () => '/tmp/Cite',
    getLanguage: () => language,
    getPayload: async () => ({
      version: 1,
      generator: 'Cite',
      styles: ['ABNT', 'APA'],
      items: [{ id: 'demo-1', title: 'Teste local', citations: { ABNT: 'TESTE, 2026.' } }]
    })
  });

  t.after(() => addin.uninstall());

  const result = await addin.install();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.status.port, 23210);
  assert.equal(result.status.running, true);

  const manifestPath = path.join(wefDir, 'cite-word.xml');
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.match(manifest, /https:\/\/localhost:23210\/taskpane\.html\?v=0\.2\.0-r\d+/);
  assert.match(manifest, /taskpane\.html\?v=0\.2\.0-r\d+&amp;mode=citation/);
  assert.doesNotMatch(manifest, /\?v=[^"<]*&(?!amp;)/);
  assert.match(manifest, /b7f3a9c2-6d41-4e8b-9c2a-1f0d5e7a3b64/);
  assert.doesNotMatch(manifest, /__PORT__/);
  assert.match(manifest, /assets\/citation-32\.png/);
  assert.match(manifest, /assets\/bibliography-32\.png/);
  assert.match(manifest, /assets\/panel-32\.png/);
  assert.match(manifest, /<FunctionName>refreshCitations<\/FunctionName>/);
  assert.match(manifest, /<FunctionName>unlinkCitations<\/FunctionName>/);

  const ping = await get('https://localhost:23210/ping');
  assert.equal(ping.status, 200);
  assert.equal(JSON.parse(ping.body).app, 'Cite');
  assert.equal(JSON.parse(ping.body).libraryPath, '/tmp/Cite');
  assert.equal(JSON.parse(ping.body).language, 'pt');

  language = 'tet';
  const pingTetun = await get('https://localhost:23210/ping');
  assert.equal(JSON.parse(pingTetun.body).language, 'tet');

  const lib = await get('https://localhost:23210/library');
  assert.equal(lib.status, 200);
  assert.equal(lib.headers['access-control-allow-origin'], '*');
  assert.equal(JSON.parse(lib.body).items[0].title, 'Teste local');

  const preflight = await get('https://localhost:23210/library', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-private-network'], 'true');

  const pane = await get('https://localhost:23210/taskpane.html');
  assert.equal(pane.status, 200);
  assert.match(pane.body, /Biblioteca do Cite/);

  const icon = await get('https://localhost:23210/assets/icon-32.png');
  assert.equal(icon.status, 200);
  assert.equal(icon.headers['content-type'], 'image/png');

  const strings = await get('https://localhost:23210/strings.js');
  assert.equal(strings.status, 200);
  assert.match(strings.body, /CiteStrings = api/);

  const fields = await get('https://localhost:23210/fields.js');
  assert.equal(fields.status, 200);
  assert.match(fields.body, /window\.CiteFields/);

  const commands = await get('https://localhost:23210/commands.js');
  assert.equal(commands.status, 200);
  assert.match(commands.body, /refreshCitations/);

  const citationIcon = await get('https://localhost:23210/assets/citation-32.png');
  assert.equal(citationIcon.status, 200);

  const missing = await get('https://localhost:23210/nao-existe');
  assert.equal(missing.status, 404);

  const uninstall = await addin.uninstall();
  assert.equal(uninstall.ok, true);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(uninstall.status.installed, false);

  fs.rmSync(root, { recursive: true, force: true });
});
