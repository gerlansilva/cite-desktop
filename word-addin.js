const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const selfsigned = require('selfsigned');
const { createConnector, DEFAULT_PORT } = require('./connector');

const MANIFEST_FILE = 'cite-word.xml';
const CERT_FILE = 'word-cert.pem';
const KEY_FILE = 'word-key.pem';
const SETTINGS_FILE = 'install.json';

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 30000, ...options }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim()
      });
    });
  });
}

function defaultWefDir() {
  if (process.env.CITE_WORD_WEF_DIR) return process.env.CITE_WORD_WEF_DIR;
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Containers', 'com.microsoft.Word', 'Data', 'Documents', 'wef');
  }
  return null;
}

function loginKeychain() {
  const modern = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
  if (fs.existsSync(modern)) return modern;
  return path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain');
}

function certificateIsUsable(certPath) {
  try {
    const pem = fs.readFileSync(certPath, 'utf8');
    const info = new crypto.X509Certificate(pem);
    const expires = new Date(info.validTo).getTime();
    return expires - Date.now() > 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function createWordAddin({ appDataDir, wordDir, getVersion, getLibraryPath, getPayload }) {
  const baseDir = process.env.CITE_WORD_ADDIN_DIR || path.join(appDataDir, 'word-addin');
  const tlsDir = path.join(baseDir, 'tls');
  const certPath = path.join(tlsDir, CERT_FILE);
  const keyPath = path.join(tlsDir, KEY_FILE);
  const settingsPath = path.join(baseDir, SETTINGS_FILE);
  const staticDir = wordDir;
  const templatePath = path.join(wordDir, 'manifest.local-server.xml');
  const wefDir = defaultWefDir();
  const manifestPath = wefDir ? path.join(wefDir, MANIFEST_FILE) : null;
  const trustMode = process.env.CITE_WORD_TRUST || 'auto';
  const preferredPort = Number(process.env.CITE_WORD_PORT) || DEFAULT_PORT;

  let connector = null;
  let lastError = '';

  function readSettings() {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  let settings = readSettings();

  function writeSettings(next) {
    settings = { ...settings, ...next };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  function certificate() {
    if (certificateIsUsable(certPath) && fs.existsSync(keyPath)) {
      return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    }
    const pems = selfsigned.generate(
      [
        { name: 'commonName', value: 'localhost' },
        { name: 'organizationName', value: 'Cite' }
      ],
      {
        days: 3650,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
          { name: 'basicConstraints', cA: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
          { name: 'extKeyUsage', serverAuth: true },
          { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }
        ]
      }
    );
    fs.mkdirSync(tlsDir, { recursive: true });
    fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    return { cert: pems.cert, key: pems.private };
  }

  async function isTrusted() {
    if (process.platform !== 'darwin') return false;
    const result = await run('security', ['verify-cert', '-c', certPath, '-p', 'ssl']);
    return result.ok;
  }

  async function trustCertificate() {
    if (trustMode === 'skip') return { ok: true, skipped: true };
    if (process.platform === 'darwin') {
      if (await isTrusted()) return { ok: true, already: true };
      const result = await run('security', [
        'add-trusted-cert',
        '-r', 'trustRoot',
        '-k', loginKeychain(),
        certPath
      ]);
      if (!result.ok) {
        return { ok: false, error: result.stderr || result.stdout || 'não foi possível confiar no certificado' };
      }
      return { ok: true };
    }
    if (process.platform === 'win32') {
      const result = await run('certutil', ['-addstore', '-user', 'Root', certPath]);
      if (!result.ok) {
        return { ok: false, error: result.stderr || result.stdout || 'não foi possível confiar no certificado' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'instalação automática disponível apenas no macOS e no Windows' };
  }

  function writeManifest(port) {
    if (!wefDir) throw new Error('pasta de suplementos do Word não encontrada');
    if (!fs.existsSync(templatePath)) throw new Error('modelo do manifesto não encontrado');
    const template = fs.readFileSync(templatePath, 'utf8');
    fs.mkdirSync(wefDir, { recursive: true });
    fs.writeFileSync(manifestPath, template.replace(/__PORT__/g, String(port)));
  }

  async function ensureServer(port) {
    if (connector?.port && connector.port === port) return connector.port;
    if (connector) connector.stop();
    const pems = certificate();
    connector = createConnector({
      cert: pems.cert,
      key: pems.key,
      staticDir,
      getVersion,
      getLibraryPath,
      getPayload,
      port: port || preferredPort
    });
    const info = await connector.start();
    return info.port;
  }

  function status() {
    const supported = Boolean(wefDir);
    return {
      supported,
      platform: process.platform,
      installed: Boolean(settings.installed),
      running: Boolean(connector?.port),
      port: connector?.port || settings.port || null,
      url: connector?.port ? `https://localhost:${connector.port}` : settings.port ? `https://localhost:${settings.port}` : '',
      trusted: Boolean(settings.trusted),
      manifestPath,
      wefDir,
      error: lastError
    };
  }

  async function install() {
    lastError = '';
    if (!wefDir) {
      lastError = 'A instalação automática está disponível no Word para macOS.';
      return { ok: false, error: lastError, status: status() };
    }
    try {
      certificate();
      const trust = await trustCertificate();
      if (!trust.ok) {
        lastError = trust.error;
        return { ok: false, error: trust.error, status: status() };
      }
      const port = await ensureServer(preferredPort);
      writeManifest(port);
      writeSettings({ installed: true, trusted: true, port, installedAt: new Date().toISOString() });
      lastError = '';
      return { ok: true, status: status() };
    } catch (err) {
      lastError = err.message;
      return { ok: false, error: err.message, status: status() };
    }
  }

  async function ensureInstalled() {
    if (!settings.installed || !wefDir) return status();
    try {
      await ensureServer(preferredPort);
      if (connector.port !== settings.port) {
        writeManifest(connector.port);
        writeSettings({ port: connector.port });
        console.log(`Manifesto do Word atualizado para a porta ${connector.port}.`);
      }
      lastError = '';
    } catch (err) {
      lastError = err.message;
      console.error('Falha ao iniciar o painel local do Word:', err.message);
    }
    return status();
  }

  async function uninstall() {
    try {
      if (manifestPath && fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
      if (connector) connector.stop();
      connector = null;
      writeSettings({ installed: false });
      lastError = '';
      return { ok: true, status: status() };
    } catch (err) {
      lastError = err.message;
      return { ok: false, error: err.message, status: status() };
    }
  }

  function stop() {
    if (connector) connector.stop();
    connector = null;
  }

  return { install, uninstall, ensureInstalled, status, stop, certificate };
}

module.exports = { createWordAddin, MANIFEST_FILE };
