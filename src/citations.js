(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Citations = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function formatAuthors(authors = [], separator = ', & ') {
    const list = authors.map((a) => String(a).trim()).filter(Boolean);
    if (list.length <= 1) return list[0] || '';
    if (list.length === 2) return `${list[0]}${separator}${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  }

  function normalizeType(value) {
    const raw = String(value || '').toLowerCase().replace(/[_\s]+/g, '-');
    if (!raw) return 'article';
    if (raw === 'chap' || raw.includes('chapter') || raw.includes('incollection') || raw.includes('section')) return 'chapter';
    if (raw.includes('conf') || raw.includes('proceeding') || raw.includes('inproceedings')) return 'conference';
    if (raw === 'thes' || raw.includes('thesis') || raw.includes('dissertation') || raw.includes('phd') || raw.includes('master')) return 'thesis';
    if (raw === 'rprt' || raw.includes('report') || raw.includes('techreport')) return 'report';
    if (raw.includes('web') || raw.includes('blog') || raw.includes('site')) return 'webpage';
    if (raw.includes('newspaper') || raw.includes('jornal')) return 'newspaper';
    if (raw.includes('magazine') || raw.includes('revista')) return 'magazine';
    if (raw.includes('book') || raw.includes('livro')) return 'book';
    return 'article';
  }

  function typeLabel(value) {
    return {
      article: 'Artigo de periódico',
      book: 'Livro',
      chapter: 'Capítulo de livro',
      conference: 'Artigo de conferência',
      thesis: 'Tese ou dissertação',
      report: 'Relatório',
      webpage: 'Página da web',
      newspaper: 'Artigo de jornal',
      magazine: 'Artigo de revista'
    }[normalizeType(value)] || 'Artigo de periódico';
  }

  function abntGivenName(value) {
    const given = String(value || '').trim();
    if (!given) return '';
    if (/^[A-Z]$/.test(given)) return `${given}.`;
    if (/^[A-Z]{2,4}$/.test(given)) return given.split('').map((letter) => `${letter}.`).join(' ');
    if (/^[A-Z](?:\.[A-Z])*\.?$/.test(given)) {
      return given
        .split('.')
        .filter(Boolean)
        .map((letter) => `${letter}.`)
        .join(' ');
    }
    return given;
  }

  function abntName(author) {
    let raw = String(author || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (/\s(ltda|s\.?a\.?|inc\.?|corp\.?)\b\.?$/i.test(raw)) return raw.toUpperCase();
    if (/^(organização|organizacao|instituto|universidade|minist[ée]rio|associa[çc][ãa]o|funda[çc][ãa]o|centro|departamento|secretaria|conselho|comiss[ãa]o|empresa|companhia)\b/i.test(raw)) {
      return raw.toUpperCase();
    }
    if (raw.includes(',')) {
      const comma = raw.indexOf(',');
      const surname = raw.slice(0, comma).trim();
      const given = abntGivenName(raw.slice(comma + 1).trim());
      return `${surname.toUpperCase()}, ${given}`.trim();
    }
    const parts = raw.split(' ');
    if (parts.length === 1) return raw.toUpperCase();
    const given = abntGivenName(parts.slice(0, -1).join(' '));
    return `${parts[parts.length - 1].toUpperCase()}, ${given}`;
  }

  function abntAuthors(authors = []) {
    const names = authors.map(abntName).filter(Boolean);
    if (!names.length) return '';
    if (names.length > 3) return `${names[0]} et al.`;
    return names.join('; ');
  }

  function sentence(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  function accessDate(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const months = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function toABNT(pub) {
    const kind = normalizeType(pub.type);
    const authors = abntAuthors(pub.authors);
    const authorPart = authors ? sentence(authors) : '';
    const title = sentence(pub.title);
    const year = String(pub.year || '').trim();
    const place = String(pub.place || '').trim();
    const publisher = String(pub.publisher || '').trim();
    const edition = pub.edition ? `${String(pub.edition).trim()}. ed.` : '';
    const journal = String(pub.fullJournal || pub.journal || '').trim();
    const pages = String(pub.pages || '').trim();
    const volume = String(pub.volume || '').trim();
    const issue = String(pub.issue || '').trim();
    const doi = String(pub.doi || '').trim();
    const url = String(pub.url || '').trim();
    const accessed = accessDate(pub.accessed);
    const pieces = [];

    if (kind === 'book') {
      const publication = [place, publisher].filter(Boolean).join(': ');
      pieces.push(authorPart, title, edition);
      if (publication || year) pieces.push([publication, year].filter(Boolean).join(', ') + '.');
    } else if (kind === 'chapter') {
      const bookTitle = sentence(pub.bookTitle || pub.journal || '');
      const editors = String(pub.editors || '')
        .split(';')
        .map((editor) => abntName(editor))
        .filter(Boolean)
        .join('; ');
      pieces.push(authorPart, title, 'In:');
      if (editors) pieces.push(sentence(editors));
      pieces.push(bookTitle, edition);
      const publication = [place, publisher].filter(Boolean).join(': ');
      if (publication || year) pieces.push([publication, year].filter(Boolean).join(', ') + '.');
      if (pages) pieces.push(`p. ${pages}.`);
    } else if (kind === 'conference') {
      const conference = String(pub.conference || '').trim();
      const proceedings = sentence(pub.proceedings || pub.bookTitle || '');
      pieces.push(authorPart, title, 'In:');
      if (conference) pieces.push([conference, year, place].filter(Boolean).join(', ') + '.');
      pieces.push(proceedings);
      const publication = [place, publisher].filter(Boolean).join(': ');
      if (publication || year) pieces.push([publication, year].filter(Boolean).join(', ') + '.');
      if (pages) pieces.push(`p. ${pages}.`);
    } else if (kind === 'thesis') {
      const institution = String(pub.university || pub.institution || '').trim();
      const thesisType = String(pub.thesisType || 'Tese').trim();
      pieces.push(authorPart, title);
      if (year) pieces.push(`${year}.`);
      pieces.push(`${thesisType} – ${institution || '[s. n.]'}${place ? `, ${place}` : ''}${year ? `, ${year}` : ''}.`);
    } else if (kind === 'report') {
      const institution = String(pub.institution || pub.university || '').trim();
      pieces.push(authorPart, title);
      const publication = [place, institution].filter(Boolean).join(': ');
      if (publication || year) pieces.push([publication, year].filter(Boolean).join(', ') + '.');
      if (pub.reportNumber) pieces.push(`(${pub.reportNumber}).`);
    } else if (kind === 'webpage') {
      pieces.push(authorPart, title);
      if (year) pieces.push(`${year}.`);
      if (url) pieces.push(`Disponível em: ${url}.`);
      if (accessed) pieces.push(`Acesso em: ${accessed}.`);
    } else {
      const section = String(pub.section || '').trim();
      const source = [journal, place, section, volume ? `v. ${volume}` : '', issue ? `n. ${issue}` : '', pages ? `p. ${pages}` : '', year]
        .filter(Boolean)
        .join(', ');
      pieces.push(authorPart, title);
      if (source) pieces.push(`${source}.`);
      if (doi) pieces.push(`DOI: ${doi}.`);
      else if (url) {
        pieces.push(`Disponível em: ${url}.`);
        if (accessed) pieces.push(`Acesso em: ${accessed}.`);
      }
    }

    if (!['article', 'webpage'].includes(kind) && doi) pieces.push(`DOI: ${doi}.`);
    if (!['article', 'webpage'].includes(kind) && url && !doi) pieces.push(`Disponível em: ${url}.`);
    if (!['article', 'webpage'].includes(kind) && url && accessed) pieces.push(`Acesso em: ${accessed}.`);

    return pieces.filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\.\.+/g, '.').trim();
  }

  function toAPA(pub) {
    const authors = formatAuthors(pub.authors, ', & ');
    const year = pub.year ? `(${pub.year}).` : '(n.d.).';
    const title = pub.title ? `${pub.title}.` : '';
    const journal = pub.journal || '';
    const volume = pub.volume ? `, ${pub.volume}` : '';
    const issue = pub.issue ? `(${pub.issue})` : '';
    const pages = pub.pages ? `, ${pub.pages}` : '';
    const source = journal ? `${journal}${volume}${issue}${pages}.` : '';
    const doi = pub.doi ? ` https://doi.org/${pub.doi}` : pub.url ? ` ${pub.url}` : '';
    return [authors, year, title, source].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + doi;
  }

  function toChicago(pub) {
    const authors = formatAuthors(pub.authors, ', and ');
    const year = pub.year ? ` (${pub.year})` : '';
    const title = pub.title ? `"${pub.title}."` : '';
    const journal = pub.journal || '';
    const volume = pub.volume ? ` ${pub.volume}` : '';
    const issue = pub.issue ? `, no. ${pub.issue}` : '';
    const pages = pub.pages ? `: ${pub.pages}` : '';
    const source = journal ? `${journal}${volume}${issue}${year}${pages}.` : year ? `${year}.` : '';
    const doi = pub.doi ? ` https://doi.org/${pub.doi}` : '';
    return [authors, title, source].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + doi;
  }

  function toMLA(pub) {
    const authors = formatAuthors(pub.authors, ', and ');
    const title = pub.title ? `"${pub.title}."` : '';
    const journal = pub.journal || '';
    const volume = pub.volume ? `, vol. ${pub.volume}` : '';
    const issue = pub.issue ? `, no. ${pub.issue}` : '';
    const year = pub.year ? `, ${pub.year}` : '';
    const pages = pub.pages ? `, pp. ${pub.pages}` : '';
    const source = journal ? `${journal}${volume}${issue}${year}${pages}.` : '';
    const doi = pub.doi ? ` https://doi.org/${pub.doi}` : '';
    return [authors, title, source].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + doi;
  }

  function toHarvard(pub) {
    const authors = formatAuthors(pub.authors, ' and ');
    const year = pub.year ? `(${pub.year})` : '(n.d.)';
    const title = pub.title ? `'${pub.title}'` : '';
    const journal = pub.journal || '';
    const volume = pub.volume ? `, ${pub.volume}` : '';
    const issue = pub.issue ? `(${pub.issue})` : '';
    const pages = pub.pages ? `, pp. ${pub.pages}` : '';
    const source = journal ? `${journal}${volume}${issue}${pages}.` : '';
    const doi = pub.doi ? ` doi: ${pub.doi}.` : '';
    return [authors, year, title, source].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + doi;
  }

  function toVancouver(pub) {
    const authors = (pub.authors || [])
      .map((a) => String(a).replace(/,/g, '').replace(/\./g, '').trim())
      .join(', ');
    const title = pub.title ? `${pub.title}.` : '';
    const journal = pub.journal ? `${pub.journal}.` : '';
    const year = pub.year ? ` ${pub.year}` : '';
    const volume = pub.volume || '';
    const issue = pub.issue ? `(${pub.issue})` : '';
    const pages = pub.pages ? `:${pub.pages}` : '';
    const source = journal ? `${journal}${year};${volume}${issue}${pages}.` : year ? `${year}.` : '';
    const doi = pub.doi ? ` doi:${pub.doi}` : '';
    return [authors ? `${authors}.` : '', title, source].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() + doi;
  }

  function format(style, pub) {
    switch (style) {
      case 'ABNT':
        return toABNT(pub);
      case 'MLA':
        return toMLA(pub);
      case 'Harvard':
        return toHarvard(pub);
      case 'Vancouver':
        return toVancouver(pub);
      case 'Chicago':
        return toChicago(pub);
      default:
        return toAPA(pub);
    }
  }

  return { toAPA, toChicago, toMLA, toHarvard, toVancouver, toABNT, format, formatAuthors, normalizeType, typeLabel };
});
