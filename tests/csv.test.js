const test = require('node:test');
const assert = require('node:assert');
const { toCSV } = require('../src/csv');

test('csv export escapes commas and quotes', () => {
  const csv = toCSV([
    { _id: 'p1', title: 'A, "quoted" paper', authors: ['Silva, G.'], year: '2026', doi: '10.1/x' }
  ]);
  const lines = csv.split('\n');
  assert.match(lines[0], /citekey,title,authors/);
  assert.match(lines[1], /"A, ""quoted"" paper"/);
  assert.match(lines[1], /Silva, G\./);
});
