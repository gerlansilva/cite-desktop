# Integrações do Cite

O Cite publica a biblioteca em um repositório GitHub. Os add-ins do Word e do Google Docs leem o mesmo arquivo `bibliography.json`.

```text
bibliography.json  → metadados + citações formatadas (ABNT, APA, MLA, Harvard, Vancouver, Chicago)
references.bib     → BibTeX para edição, versionamento e outros gerenciadores
```

## Publicar

1. Abra o Cite.
2. Vá em **Ferramentas → Integrações**.
3. Informe `usuario/repositorio`, branch, pasta e um token do GitHub com permissão de conteúdo.
4. Clique em **Publicar no GitHub**.

O token fica criptografado no armazenamento local do Cite e não é enviado aos add-ins.

## Word

Siga [word/README.md](word/README.md).

## Google Docs

Siga [google-docs/README.md](google-docs/README.md).

## GitHub Pages

O Word precisa que o painel (`taskpane.html`) esteja hospedado em HTTPS. O GitHub Pages pode servir essa pasta diretamente. O Google Docs não precisa do painel hospedado: o Apps Script roda dentro do Google.
