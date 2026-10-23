require('fake-indexeddb/auto');
const test = require('node:test');
const assert = require('node:assert');
const { CiteDB, recordChange } = require('../src/data/db');
const { compactChanges, applyServerChanges } = require('../src/data/sync');

test('db insert and oplog', async () => {
  const db = new CiteDB('test-db-1');
  await db.Library.put({ _id: 'p1', title: 'Paper' });
  const pub = await db.Library.get('p1');
  assert.equal(pub.title, 'Paper');
  const change = await recordChange(db, { mcollection: 'Library', action: 'update', id: 'p1', fields: ['starred'] });
  assert.ok(change._id);
  assert.equal(await db.Changes.count(), 1);
  await db.delete();
});

test('notes changes are recorded in oplog', async () => {
  const db = new CiteDB('test-db-notes');
  await recordChange(db, {
    mcollection: 'Notes',
    action: 'insert',
    id: 'n1',
    data: { _id: 'n1', attachment_id: 'a1', text: 'note' }
  });
  const changes = await db.Changes.toArray();
  assert.equal(changes[0].mcollection, 'Notes');
  assert.equal(changes[0].data.text, 'note');
  await db.delete();
});

test('compact starred updates', () => {
  const changes = [
    { mcollection: 'Library', action: 'update', id: 'a', fields: ['starred'], timestamp: 1 },
    { mcollection: 'Library', action: 'update', id: 'b', fields: ['starred'], timestamp: 2 }
  ];
  const out = compactChanges(changes);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].id, ['a', 'b']);
});

test('conflicting note updates are merged', async () => {
  const db = new CiteDB('test-db-merge-notes');
  await db.Notes.put({ _id: 'n1', attachment_id: 'a1', text: 'local note' });
  await applyServerChanges(db, [
    { mcollection: 'Notes', action: 'update', id: 'n1', data: { text: 'remote note' } }
  ]);
  const note = await db.Notes.get('n1');
  assert.match(note.text, /local note/);
  assert.match(note.text, /\[merged\] remote note/);
  await db.delete();
});

