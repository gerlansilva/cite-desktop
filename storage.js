const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function attachmentsDir() {
  const dir = path.join(app.getPath('userData'), 'attachments');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

ipcMain.handle('attachments:save', async (_event, { name, data }) => saveAttachment(name, data));

function saveAttachment(name, data) {
  const buf = Buffer.from(data);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  // dedup: reuse existing file with same hash
  const existing = fs.readdirSync(attachmentsDir()).find((f) => f.startsWith(hash + '-'));
  if (existing) {
    return { path: path.join(attachmentsDir(), existing), hash, size: buf.length, deduped: true };
  }
  const fileName = `${hash}-${safeName(name || 'file')}`;
  const filePath = path.join(attachmentsDir(), fileName);
  fs.writeFileSync(filePath, buf);
  return { path: filePath, hash, size: buf.length, deduped: false };
}

ipcMain.handle('attachments:list', async () => {
  return fs.readdirSync(attachmentsDir()).map((f) => ({
    name: f,
    path: path.join(attachmentsDir(), f),
    size: fs.statSync(path.join(attachmentsDir(), f)).size
  }));
});

function cleanupOrphans(keepPaths = [], maxAgeMs = 0) {
  const keep = new Set(keepPaths);
  const cutoff = maxAgeMs > 0 ? Date.now() - maxAgeMs : Infinity;
  let removed = 0;
  for (const f of fs.readdirSync(attachmentsDir())) {
    const p = path.join(attachmentsDir(), f);
    if (keep.has(p)) continue;
    if (fs.statSync(p).mtimeMs > cutoff) continue;
    fs.unlinkSync(p);
    removed++;
  }
  return { removed };
}

ipcMain.handle('attachments:cleanupOrphans', async (_event, keepPaths = [], maxAgeMs = 0) =>
  cleanupOrphans(keepPaths, maxAgeMs)
);

ipcMain.handle('attachments:read', async (_event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
});

ipcMain.handle('attachments:delete', async (_event, filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('attachments:dir', async () => attachmentsDir());

module.exports = { attachmentsDir, safeName, saveAttachment, cleanupOrphans };
