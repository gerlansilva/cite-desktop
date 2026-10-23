function compactChanges(changes) {
  const out = [];
  let last = null;
  for (const c of changes) {
    if (
      last &&
      last.mcollection === c.mcollection &&
      last.action === c.action &&
      last.action !== 'remove' &&
      last.fields?.length === 1 &&
      c.fields?.length === 1 &&
      last.fields[0] === c.fields[0] &&
      ['trashed', 'starred'].includes(c.fields[0])
    ) {
      last.id = [].concat(last.id, c.id);
      last.timestamp = c.timestamp;
      continue;
    }
    out.push({ ...c });
    last = out[out.length - 1];
  }
  return out;
}

async function applyServerChanges(db, changes) {
  for (const c of changes) {
    const ids = Array.isArray(c.id) ? c.id : [c.id];
    for (const id of ids) {
      if (c.action === 'insert' && c.data) {
        await db.table(c.mcollection).put({ ...c.data, _id: id });
      } else if (c.action === 'update' && c.data) {
        let data = c.data;
        if (c.mcollection === 'Notes' && data.text) {
          const local = await db.Notes.get(id);
          if (local?.text && local.text !== data.text && !local.text.includes('[merged]')) {
            data = { ...data, text: `${local.text}\n\n[merged] ${data.text}`, merged: true };
          }
        }
        await db.table(c.mcollection).update(id, data);
      } else if (c.action === 'remove') {
        await db.table(c.mcollection).delete(id);
      }
    }
  }
}

module.exports = { compactChanges, applyServerChanges };
