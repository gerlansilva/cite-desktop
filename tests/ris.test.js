const test = require('node:test');
const assert = require('node:assert');
const { parseRIS, toRIS } = require('../src/ris');

test('parse RIS entries', () => {
  const entries = parseRIS(
    'TY  - JOUR\nTI  - RIS Paper\nAU  - Silva, G.\nAU  - Souza, A.\nPY  - 2026\nJO  - Journal\nDO  - 10.1/ris\nER  - \n'
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'RIS Paper');
  assert.deepEqual(entries[0].authors, ['Silva, G.', 'Souza, A.']);
  assert.equal(entries[0].doi, '10.1/ris');
});

test('export RIS roundtrip', () => {
  const ris = toRIS([{ title: 'Paper', authors: ['A'], year: '2026', doi: '10.1/x' }]);
  assert.match(ris, /TY  - JOUR/);
  const parsed = parseRIS(ris);
  assert.equal(parsed[0].title, 'Paper');
});
