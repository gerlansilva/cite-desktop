const test = require('node:test');
const assert = require('node:assert');
const { parseBibtex, toBibtex } = require('../src/bibtex');

test('parse bibtex entries', () => {
  const entries = parseBibtex(`
@article{smith2024,
  title = {A Great Paper},
  author = {Smith, John and Silva, Ana},
  year = {2024},
  journal = {Nature},
  doi = {10.1234/test}
}
`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].citekey, 'smith2024');
  assert.equal(entries[0].title, 'A Great Paper');
  assert.deepEqual(entries[0].authors, ['Smith, John', 'Silva, Ana']);
  assert.equal(entries[0].journal, 'Nature');
});

test('export bibtex roundtrip', () => {
  const pubs = [{ _id: 'p1', title: 'Paper', authors: ['A', 'B'], year: '2025', journal: 'J' }];
  const bib = toBibtex(pubs);
  assert.match(bib, /@article\{p1/);
  const parsed = parseBibtex(bib);
  assert.equal(parsed[0].title, 'Paper');
  assert.deepEqual(parsed[0].authors, ['A', 'B']);
});
