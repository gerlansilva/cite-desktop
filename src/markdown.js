(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarkdownExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function toMarkdown(pubs, notes = []) {
    const lines = ['# Library', ''];
    for (const p of pubs) {
      lines.push(`## ${p.title || '(untitled)'}`);
      if (p.authors?.length) lines.push(`**Authors:** ${p.authors.join(', ')}`);
      if (p.year) lines.push(`**Year:** ${p.year}`);
      if (p.journal) lines.push(`**Journal:** ${p.journal}`);
      if (p.doi) lines.push(`**DOI:** ${p.doi}`);
      if (p.folder) lines.push(`**Folder:** ${p.folder}`);
      lines.push('');
    }
    if (notes.length) {
      lines.push('# Annotations', '');
      for (const n of notes) {
        const page = n.page ? ` (p. ${n.page})` : '';
        lines.push(`- **${n.attachment_id}**${page}: ${n.text}`);
        if (n.comment) lines.push(`  - Comentário: ${n.comment}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  return { toMarkdown };
});
