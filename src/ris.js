(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RIS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function parseRIS(text) {
    const typeMap = {
      JOUR: 'article',
      BOOK: 'book',
      CHAP: 'chapter',
      CONF: 'conference',
      CPAPER: 'conference',
      THES: 'thesis',
      RPRT: 'report',
      ELEC: 'webpage',
      NEWS: 'newspaper',
      MGZN: 'magazine'
    };
    const entries = [];
    let current = null;
    for (const raw of text.split(/\r?\n/)) {
      const m = /^([A-Z0-9]{2})  - (.*)$/.exec(raw);
      if (!m) continue;
      const [, tag, value] = m;
      if (tag === 'TY') {
        current = { type: typeMap[value.trim()] || 'article', authors: [], tags: [] };
        continue;
      }
      if (!current) continue;
      if (tag === 'ER') {
        if (!current.tags.length) delete current.tags;
        entries.push(current);
        current = null;
        continue;
      }
      if (tag === 'AU' || tag === 'A1') current.authors.push(value.trim());
      else if (tag === 'A2' || tag === 'ED') current.editors = value.trim();
      else if (tag === 'TI' || tag === 'T1') current.title = value.trim();
      else if (tag === 'PY' || tag === 'Y1') current.year = value.trim();
      else if (tag === 'JO' || tag === 'JF') current.journal = value.trim();
      else if (tag === 'T2') {
        if (current.type === 'chapter') current.bookTitle = value.trim();
        else if (current.type === 'conference') current.proceedings = value.trim();
        else current.journal = value.trim();
      } else if (tag === 'T3') current.conference = value.trim();
      else if (tag === 'VL') current.volume = value.trim();
      else if (tag === 'IS') current.issue = value.trim();
      else if (tag === 'SP') current.pages = value.trim();
      else if (tag === 'EP') current.pages = current.pages ? `${current.pages}-${value.trim()}` : value.trim();
      else if (tag === 'PB') current.publisher = value.trim();
      else if (tag === 'CY') current.place = value.trim();
      else if (tag === 'ET') current.edition = value.trim();
      else if (tag === 'SN') {
        if (current.type === 'book' || current.type === 'chapter') current.isbn = value.trim();
        else current.issn = value.trim();
      } else if (tag === 'LA') current.language = value.trim();
      else if (tag === 'KW') current.tags.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
      else if (tag === 'DO') current.doi = value.trim();
      else if (tag === 'UR') current.url = value.trim();
      else if (tag === 'AB') current.abstract = value.trim();
    }
    return entries.map((e, i) => ({
      ...e,
      _id: e.doi ? `ris-${e.doi.replace(/[^\w.-]/g, '_')}` : `ris-${Date.now()}-${i}`,
      citekey: e.doi || `ris-${i}`
    }));
  }

  function toRIS(pubs) {
    const typeMap = {
      article: 'JOUR',
      book: 'BOOK',
      chapter: 'CHAP',
      conference: 'CONF',
      thesis: 'THES',
      report: 'RPRT',
      webpage: 'ELEC',
      newspaper: 'NEWS',
      magazine: 'MGZN'
    };
    return pubs
      .map((p) => {
        const lines = [`TY  - ${typeMap[p.type] || 'JOUR'}`];
        if (p.title) lines.push(`TI  - ${p.title}`);
        for (const a of p.authors || []) lines.push(`AU  - ${a}`);
        if (p.editors) lines.push(`A2  - ${p.editors}`);
        if (p.year) lines.push(`PY  - ${p.year}`);
        if (p.journal) lines.push(`JO  - ${p.journal}`);
        if (p.bookTitle || p.proceedings) lines.push(`T2  - ${p.bookTitle || p.proceedings}`);
        if (p.conference) lines.push(`T3  - ${p.conference}`);
        if (p.volume) lines.push(`VL  - ${p.volume}`);
        if (p.issue) lines.push(`IS  - ${p.issue}`);
        if (p.pages) lines.push(`SP  - ${p.pages}`);
        if (p.publisher) lines.push(`PB  - ${p.publisher}`);
        if (p.place) lines.push(`CY  - ${p.place}`);
        if (p.edition) lines.push(`ET  - ${p.edition}`);
        if (p.isbn || p.issn) lines.push(`SN  - ${p.isbn || p.issn}`);
        if (p.language) lines.push(`LA  - ${p.language}`);
        for (const tag of p.tags || []) lines.push(`KW  - ${tag}`);
        if (p.doi) lines.push(`DO  - ${p.doi}`);
        if (p.url) lines.push(`UR  - ${p.url}`);
        if (p.abstract) lines.push(`AB  - ${p.abstract}`);
        lines.push('ER  - ', '');
        return lines.join('\n');
      })
      .join('\n');
  }

  return { parseRIS, toRIS };
});
