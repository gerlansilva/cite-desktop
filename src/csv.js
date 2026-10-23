(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CSVExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function escape(value) {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(pubs) {
    const header = ['citekey', 'title', 'authors', 'year', 'journal', 'volume', 'issue', 'pages', 'publisher', 'doi', 'url', 'folder'];
    const rows = pubs.map((p) =>
      [
        p.citekey || p._id,
        p.title,
        (p.authors || []).join('; '),
        p.year,
        p.journal,
        p.volume,
        p.issue,
        p.pages,
        p.publisher,
        p.doi,
        p.url,
        p.folder
      ].map(escape)
    );
    return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  return { toCSV };
});
