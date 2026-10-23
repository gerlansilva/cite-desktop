const test = require('node:test');
const assert = require('node:assert');
const { toMarkdown } = require('../src/markdown');

test('markdown export includes references and annotations', () => {
  const md = toMarkdown(
    [{ title: 'Paper A', authors: ['Silva, G.'], year: '2026', doi: '10.1/x' }],
    [{ attachment_id: 'a.pdf', page: '2', text: 'Important finding', comment: 'Check this' }]
  );
  assert.match(md, /# Library/);
  assert.match(md, /## Paper A/);
  assert.match(md, /10\.1\/x/);
  assert.match(md, /Important finding/);
  assert.match(md, /p\. 2/);
  assert.match(md, /Comentário: Check this/);
});
