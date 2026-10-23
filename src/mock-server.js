const http = require('http');

function makePdf(text = 'PDF for tests') {
  const stream = `BT /F1 18 Tf 20 100 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function createMockServer() {
  const requests = [];
  const files = {};
  const server = http.createServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    const requestUrl = new URL(req.url, origin);
    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'GET' && requestUrl.pathname === '/translate') {
      const text = requestUrl.searchParams.get('q') || '';
      const target = requestUrl.searchParams.get('target') || 'pt';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ translatedText: `[${target}] ${text}` }));
    }
    if (req.method === 'GET' && requestUrl.pathname === '/article') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head>
        <title>Landing Article</title>
        <meta name="citation_title" content="Landing Article">
        <meta name="citation_author" content="Ana Silva">
        <meta name="citation_publication_date" content="2024/01/02">
        <meta name="citation_journal_title" content="Journal of Landing">
        <meta name="citation_volume" content="12">
        <meta name="citation_issue" content="3">
        <meta name="citation_firstpage" content="7">
        <meta name="citation_lastpage" content="19">
        <meta name="citation_issn" content="1234-5678">
        <meta name="citation_publisher" content="Landing Press">
        <meta name="citation_language" content="en">
        <meta name="citation_pdf_url" content="${origin}/pdf/landing-article.pdf">
      </head><body><h1>Landing Article</h1></body></html>`);
    }
    if (req.method === 'GET' && requestUrl.pathname.startsWith('/pdf/')) {
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${requestUrl.pathname.split('/').pop() || 'paper.pdf'}"`
      });
      return res.end(makePdf('PDF downloaded by Cite'));
    }
    if (req.method === 'GET' && req.url.startsWith('/arxiv?')) {
      res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <published>2024-01-02T00:00:00Z</published>
    <title>ArXiv Paper</title>
    <summary>An arXiv abstract.</summary>
    <author><name>Ana Silva</name></author>
  </entry>
</feed>`);
    }
    if (req.method === 'GET' && req.url.startsWith('/pubmed/esearch.fcgi')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ esearchresult: { idlist: ['12345'] } }));
    }
    if (req.method === 'GET' && req.url.startsWith('/pubmed/esummary.fcgi')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          result: {
            uids: ['12345'],
            '12345': {
              title: 'PubMed Paper',
              authors: [{ name: 'Silva G' }],
              pubdate: '2023 Mar',
              fulljournalname: 'Journal of Medicine',
              volume: '10',
              issue: '2',
              pages: '5-9',
              articleids: [{ idtype: 'doi', value: '10.1/pubmed' }]
            }
          }
        })
      );
    }
    if (req.method === 'GET' && requestUrl.pathname === '/google') {
      const query = requestUrl.searchParams.get('q') || '';
      const start = Number(requestUrl.searchParams.get('start') || 0);
      const plainBlock = (title, index) => `
  <div class="gs_r gs_or">
  <div class="gs_ri">
    <h3 class="gs_rt"><a href="${origin}/article?i=${index}">${title}</a></h3>
    <div class="gs_a">Ana Silva - Journal of Scholar, 2024 - example.org</div>
    <div class="gs_rs">An abstract from Google Scholar.</div>
  </div>
  </div>`;
      const blocks =
        query === 'pagination-google'
          ? start > 0
            ? [plainBlock('Google More Paper', 10)]
            : Array.from({ length: 9 }, (_, index) => plainBlock(`Google Pagination ${index + 1}`, index))
          : [
              `
  <div class="gs_r gs_or">
  <div class="gs_ggs gs_fl"><div class="gs_ggsd"><a class="gs_or_ggsm_exp" href="javascript:void(0)" role="button" aria-label="Abrir">[PDF]</a><div class="gs_or_ggsm" tabindex="-1"><a href="${origin}/pdf/google-paper.pdf">[PDF] example.org</a></div></div></div>
  <div class="gs_ri">
    <h3 class="gs_rt"><a href="${origin}/article">Google Scholar Paper</a></h3>
    <div class="gs_a">Ana Silva, Bruno Souza - Journal of Scholar, 2024 - example.org</div>
    <div class="gs_rs">An abstract from Google Scholar.</div>
  </div>
  </div>`
            ];
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><body>${blocks.join('')}</body></html>`);
    }
    if (req.method === 'GET' && requestUrl.pathname === '/works') {
      const item = (doi, title) => ({
        DOI: doi,
        title: [title],
        author: [{ given: 'Ana', family: 'Silva' }],
        issued: { 'date-parts': [[2024]] },
        'container-title': ['Journal of Search'],
        volume: '2',
        issue: '1',
        page: '10-20',
        URL: `https://doi.org/${doi}`,
        link: [{ URL: `${origin}/pdf/search-result.pdf`, 'content-type': 'application/pdf' }]
      });
      const offset = Number(requestUrl.searchParams.get('offset') || 0);
      const query = requestUrl.searchParams.get('query.bibliographic') || '';
      const items =
        query === 'pagination'
          ? offset > 0
            ? [item('10.1/search-more', 'Search More Paper')]
            : Array.from({ length: 10 }, (_, index) => item(`10.1/page-${index + 1}`, `Pagination Paper ${index + 1}`))
          : [item('10.1/search', 'Search Result Paper')];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: { items } }));
    }
    if (req.method === 'GET' && req.url.startsWith('/works/')) {
      const doi = decodeURIComponent(req.url.slice('/works/'.length));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          message: {
            DOI: doi,
            title: ['DOI Paper'],
            author: [{ given: 'Ana', family: 'Silva' }],
            issued: { 'date-parts': [[2026]] },
            'container-title': ['Journal of Tests'],
            volume: '1',
            issue: '2',
            page: '1-10',
            publisher: 'Test Press',
            URL: `https://doi.org/${doi}`
          }
        })
      );
    }
    if (requestUrl.pathname.startsWith('/repos/') && requestUrl.pathname.includes('/contents/')) {
      const rest = requestUrl.pathname.slice('/repos/'.length);
      const marker = rest.indexOf('/contents/');
      const repo = rest.slice(0, marker);
      const filePath = decodeURIComponent(rest.slice(marker + '/contents/'.length));
      if (req.method === 'GET') {
        if (!files[filePath]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Not Found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ sha: `sha-${filePath}` }));
      }
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          files[filePath] = Buffer.from(parsed.content || '', 'base64').toString('utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              content: {
                html_url: `https://github.com/${repo}/blob/${parsed.branch || 'main'}/${filePath}`
              }
            })
          );
        });
        return;
      }
    }
    res.writeHead(404);
    res.end('not found');
  });
  return {
    server,
    requests,
    files,
    listen: (port = 0) =>
      new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

module.exports = { createMockServer };
