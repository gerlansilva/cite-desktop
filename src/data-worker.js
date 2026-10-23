const { ipcRenderer } = require('electron');
const { CiteDB, recordChange } = require('./data/db');
const { applyServerChanges } = require('./data/sync');

const db = new CiteDB('refdesk');

async function handle(method, args) {
  switch (method) {
    case 'library:put': {
      const existing = await db.Library.get(args._id);
      await db.Library.put(args);
      await recordChange(db, {
        mcollection: 'Library',
        action: existing ? 'update' : 'insert',
        id: args._id,
        data: args
      });
      return args;
    }
    case 'library:get':
      return db.Library.get(args);
    case 'library:count':
      return db.Library.count();
    case 'library:all':
      return db.Library.toArray();
    case 'library:delete':
      await db.Library.delete(args);
      await recordChange(db, { mcollection: 'Library', action: 'remove', id: args });
      return { ok: true };
    case 'change:record':
      return recordChange(db, args);
    case 'changes:count':
      return db.Changes.count();
    case 'changes:all':
      return db.Changes.orderBy('timestamp').toArray();
    case 'changes:clear':
      await db.Changes.clear();
      return { ok: true };
    case 'changes:apply':
      await applyServerChanges(db, args || []);
      return { ok: true };
    case 'duplicates:mergeAll': {
      const pubs = await db.Library.toArray();
      const groups = new Map();
      for (const pub of pubs) {
        const key = (pub.doi || pub.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(pub);
      }
      let merged = 0;
      let groupCount = 0;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        groupCount++;
        const [keep, ...rest] = group;
        const mergedPub = { ...keep };
        for (const other of rest) {
          for (const field of ['journal', 'year', 'doi', 'url', 'abstract', 'publisher']) {
            if (!mergedPub[field] && other[field]) mergedPub[field] = other[field];
          }
          const folders = new Set([...(mergedPub.folders || []), ...(other.folders || [])]);
          mergedPub.folders = [...folders];
        }
        await db.Library.put(mergedPub);
        await recordChange(db, { mcollection: 'Library', action: 'update', id: keep._id, data: mergedPub });
        for (const other of rest) {
          await db.Library.delete(other._id);
          await recordChange(db, { mcollection: 'Library', action: 'remove', id: other._id });
          merged++;
        }
      }
      return { merged, groupCount };
    }
    case 'duplicates:find': {
      const pubs = await db.Library.toArray();
      const groups = new Map();
      for (const pub of pubs) {
        const key = (pub.doi || pub.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(pub);
      }
      return [...groups.values()].filter((g) => g.length > 1);
    }
    case 'notes:add': {
      const note = { _id: args._id || crypto.randomUUID(), ...args };
      await db.Notes.put(note);
      await recordChange(db, { mcollection: 'Notes', action: 'insert', id: note._id, data: note });
      return note;
    }
    case 'notes:update': {
      const existing = await db.Notes.get(args._id);
      if (!existing) throw new Error('Note not found');
      const updated = { ...existing, ...args };
      await db.Notes.put(updated);
      await recordChange(db, { mcollection: 'Notes', action: 'update', id: updated._id, data: updated });
      return updated;
    }
    case 'notes:list':
      return db.Notes.where('attachment_id').equals(args).toArray();
    case 'notes:all':
      return db.Notes.toArray();
    case 'collections:all':
      return db.Collections.toArray();
    case 'collections:save': {
      const existing = args._id ? await db.Collections.get(args._id) : null;
      const col = { ...args, _id: args._id || crypto.randomUUID() };
      await db.Collections.put(col);
      await recordChange(db, {
        mcollection: 'Collections',
        action: existing ? 'update' : 'insert',
        id: col._id,
        data: col
      });
      return col;
    }
    case 'collections:delete':
      await db.Collections.delete(args);
      await recordChange(db, { mcollection: 'Collections', action: 'remove', id: args });
      return { ok: true };
    case 'attachments:add': {
      const att = {
        ...args,
        _id: args._id || crypto.randomUUID(),
        created_at: args.created_at || Date.now()
      };
      await db.Attachments.put(att);
      await recordChange(db, { mcollection: 'Attachments', action: 'insert', id: att._id, data: att });
      return att;
    }
    case 'attachments:all':
      return db.Attachments.toArray();
    case 'attachments:rebasePaths': {
      const { from, to } = args || {};
      if (!from || !to) return 0;
      let updated = 0;
      for (const row of await db.Attachments.toArray()) {
        if (typeof row.path === 'string' && row.path.startsWith(from)) {
          row.path = to + row.path.slice(from.length);
          await db.Attachments.put(row);
          updated++;
        }
      }
      return updated;
    }
    case 'attachments:forPub':
      return db.Attachments.where('pub_id').equals(args).toArray();
    case 'attachments:update': {
      const existing = await db.Attachments.get(args._id);
      if (!existing) throw new Error('Attachment not found');
      const updated = { ...existing, ...args };
      await db.Attachments.put(updated);
      await recordChange(db, { mcollection: 'Attachments', action: 'update', id: updated._id, data: updated });
      return updated;
    }
    case 'attachments:delete': {
      await db.Attachments.delete(args);
      await recordChange(db, { mcollection: 'Attachments', action: 'remove', id: args });
      return { ok: true };
    }
    case 'notes:delete':
      await db.Notes.delete(args);
      await recordChange(db, { mcollection: 'Notes', action: 'remove', id: args });
      return { ok: true };
    case 'settings:get':
      return (await db.LocalSettings.get('main')) || {};
    case 'settings:set':
      await db.LocalSettings.put({ _id: 'main', ...(args || {}) });
      return { ok: true };
    case 'db:delete':
      await db.delete();
      return { ok: true };
    case 'db:export': {
      const data = {};
      for (const table of db.tables) data[table.name] = await table.toArray();
      return data;
    }
    case 'db:import': {
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
          const rows = args?.[table.name] || [];
          if (rows.length) await table.bulkPut(rows);
        }
      });
      return { ok: true };
    }
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

ipcRenderer.on('data:request', async (event, { id, method, args }) => {
  try {
    const result = await handle(method, args);
    event.sender.send('data:response', { id, result });
  } catch (error) {
    event.sender.send('data:response', { id, error: error.message });
  }
});
