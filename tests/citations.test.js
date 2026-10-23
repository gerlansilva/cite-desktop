const test = require('node:test');
const assert = require('node:assert');
const { toAPA, toChicago, toMLA, toHarvard, toVancouver, toABNT, format, formatAuthors } = require('../src/citations');

test('APA citation includes authors, year, journal and DOI', () => {
  const apa = toAPA({
    title: 'Attention Is All You Need',
    authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.'],
    year: '2017',
    journal: 'NeurIPS',
    volume: '30',
    pages: '1-11',
    doi: '10.1/apa'
  });
  assert.match(apa, /Vaswani, A\., Shazeer, N\., & Parmar, N\./);
  assert.match(apa, /\(2017\)\./);
  assert.match(apa, /NeurIPS, 30, 1-11\./);
  assert.match(apa, /https:\/\/doi\.org\/10\.1\/apa/);
});

test('single and two-author formatting', () => {
  assert.equal(formatAuthors(['Silva, G.']), 'Silva, G.');
  assert.equal(formatAuthors(['Silva, G.', 'Souza, A.']), 'Silva, G., & Souza, A.');
});

test('Chicago citation and missing year fallback', () => {
  const chicago = toChicago({
    title: 'A Paper',
    authors: ['Silva, G.'],
    year: '2026',
    journal: 'Journal',
    volume: '1',
    issue: '2',
    pages: '3-4'
  });
  assert.match(chicago, /Silva, G\. "A Paper\."/);
  assert.match(chicago, /Journal 1, no\. 2 \(2026\): 3-4\./);
  assert.match(toAPA({ title: 'No Date', authors: [] }), /\(n\.d\.\)/);
});

test('ABNT formatting for articles, books, chapters, theses and webpages', () => {
  const article = {
    title: 'A Paper',
    authors: ['Silva, G.', 'Souza, A.'],
    year: '2026',
    journal: 'Journal',
    volume: '1',
    issue: '2',
    pages: '3-4',
    doi: '10.1/x'
  };
  assert.match(
    toABNT(article),
    /SILVA, G\.; SOUZA, A\. A Paper\. Journal, v\. 1, n\. 2, p\. 3-4, 2026\. DOI: 10\.1\/x\./
  );
  assert.match(
    toABNT({ ...article, type: 'book', publisher: 'Editora', place: 'São Paulo', edition: '2' }),
    /SILVA, G\.; SOUZA, A\. A Paper\. 2\. ed\. São Paulo: Editora, 2026\./
  );
  assert.match(
    toABNT({ ...article, type: 'chapter', bookTitle: 'Livro', place: 'Rio', publisher: 'Editora', pages: '10-20' }),
    /In: Livro\. Rio: Editora, 2026\. p\. 10-20\./
  );
  assert.match(
    toABNT({ ...article, type: 'thesis', university: 'USP', thesisType: 'Dissertação (Mestrado)', place: 'São Paulo' }),
    /Dissertação \(Mestrado\) – USP, São Paulo, 2026\./
  );
  assert.match(
    toABNT({ ...article, type: 'webpage', url: 'https://example.org', accessed: '2026-10-22' }),
    /Disponível em: https:\/\/example\.org\. Acesso em: 22 out\. 2026\./
  );
  assert.match(toABNT({ ...article, authors: ['A, B.', 'C, D.', 'E, F.', 'G, H.'] }), /A, B\. et al\./);
  assert.match(format('ABNT', article), /SILVA, G\./);
});

test('MLA, Harvard and Vancouver formatting', () => {
  const pub = {
    title: 'A Paper',
    authors: ['Silva, G.', 'Souza, A.'],
    year: '2026',
    journal: 'Journal',
    volume: '1',
    issue: '2',
    pages: '3-4',
    doi: '10.1/x'
  };
  assert.match(toMLA(pub), /"A Paper\." Journal, vol\. 1, no\. 2, 2026, pp\. 3-4\./);
  assert.match(toHarvard(pub), /\(2026\) 'A Paper' Journal, 1\(2\), pp\. 3-4\. doi: 10\.1\/x\./);
  assert.match(toVancouver(pub), /Silva G, Souza A\. A Paper\. Journal\. 2026;1\(2\):3-4\. doi:10\.1\/x/);
  assert.match(format('MLA', pub), /A Paper/);
  assert.match(format('Unknown', pub), /\(2026\)\./);
});
