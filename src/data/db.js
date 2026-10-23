const Dexie = require('dexie');

class CiteDB extends Dexie {
  // O nome interno "refdesk" é mantido para preservar bibliotecas já existentes.
  constructor(name = 'refdesk') {
    super(name);
    this.version(1).stores({
      Library: '_id, citekey',
      Attachments: '_id, pub_id',
      Collections: '_id',
      Notes: '_id, attachment_id',
      Changes: '_id, timestamp',
      LocalSettings: '_id',
      Files: '_id'
    });
  }
}

async function recordChange(db, change) {
  const entry = {
    ...change,
    _id: change._id || crypto.randomUUID(),
    timestamp: change.timestamp || Date.now()
  };
  await db.Changes.put(entry);
  return entry;
}

module.exports = { CiteDB, recordChange };
