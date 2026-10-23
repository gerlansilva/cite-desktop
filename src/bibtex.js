(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BibTeX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function splitTopLevel(body, sep = ',') {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of body) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (ch === sep && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  function cleanValue(raw) {
    let v = raw.trim();
    if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1);
    else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return v.replace(/\s+/g, ' ').trim();
  }

  function parseBibtex(text) {
    const entries = [];
    let i = 0;
    while ((i = text.indexOf('@', i)) !== -1) {
      const header = /^@(\w+)\s*\{\s*([^,\s]+)\s*,/.exec(text.slice(i));
      if (!header) {
        i++;
        continue;
      }
      const type = header[1].toLowerCase();
      const key = header[2];
      let cursor = i + header[0].length;
      let depth = 1;
      const start = cursor;
      while (cursor < text.length && depth > 0) {
        if (text[cursor] === '{') depth++;
        else if (text[cursor] === '}') depth--;
        cursor++;
      }
      const body = text.slice(start, cursor - 1);
      const fields = {};
      for (const part of splitTopLevel(body)) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const name = part.slice(0, eq).trim().toLowerCase();
        fields[name] = cleanValue(part.slice(eq + 1));
      }
      const conference = ['inproceedings', 'conference', 'proceedings'].includes(type);
      const chapter = ['incollection', 'inbook', 'chapter'].includes(type);
      entries.push({
        _id: key,
        type,
        citekey: key,
        title: fields.title,
        authors: fields.author ? fields.author.split(/\s+and\s+/).map((a) => a.trim()) : [],
        editors: fields.editor
          ? fields.editor.split(/\s+and\s+/).map((editor) => editor.trim()).join('; ')
          : undefined,
        year: fields.year,
        journal: fields.journal || (type === 'article' ? fields.booktitle : undefined),
        bookTitle: chapter ? fields.booktitle : undefined,
        proceedings: conference ? fields.booktitle : undefined,
        conference: conference ? fields.eventtitle : undefined,
        volume: fields.volume,
        issue: fields.number,
        pages: fields.pages,
        publisher: fields.publisher,
        place: fields.address || fields.location,
        edition: fields.edition,
        isbn: fields.isbn,
        issn: fields.issn,
        university: fields.school,
        thesisType: fields.type,
        institution: fields.institution || fields.organization,
        reportNumber: fields.number,
        website: fields.howpublished,
        accessed: fields.urldate,
        language: fields.language,
        tags: fields.keywords ? fields.keywords.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean) : undefined,
        doi: fields.doi,
        url: fields.url,
        abstract: fields.abstract
      });
      i = cursor;
    }
    return entries;
  }

  function toBibtex(pubs) {
    const typeMap = {
      article: 'article',
      book: 'book',
      chapter: 'incollection',
      conference: 'inproceedings',
      thesis: 'phdthesis',
      report: 'techreport',
      webpage: 'misc',
      newspaper: 'article',
      magazine: 'article'
    };
    return pubs
      .map((p) => {
        const type = typeMap[p.type] || p.type || 'article';
        const key = p.citekey || p._id || 'ref';
        const fields = [
          ['title', p.title],
          ['author', (p.authors || []).join(' and ')],
          ['editor', p.editors],
          ['year', p.year],
          ['journal', p.journal],
          ['booktitle', p.bookTitle || p.proceedings],
          ['eventtitle', p.conference],
          ['volume', p.volume],
          ['number', p.issue || p.reportNumber],
          ['pages', p.pages],
          ['publisher', p.publisher],
          ['address', p.place],
          ['edition', p.edition],
          ['isbn', p.isbn],
          ['issn', p.issn],
          ['school', p.university],
          ['institution', p.institution],
          ['type', p.thesisType],
          ['howpublished', p.website],
          ['urldate', p.accessed],
          ['language', p.language],
          ['keywords', (p.tags || []).join(', ')],
          ['doi', p.doi],
          ['url', p.url],
          ['abstract', p.abstract]
        ]
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `  ${k} = {${v}}`)
          .join(',\n');
        return `@${type}{${key},\n${fields}\n}`;
      })
      .join('\n\n');
  }

  return { parseBibtex, toBibtex };
});
