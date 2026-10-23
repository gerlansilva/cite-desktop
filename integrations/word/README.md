# Add-in do Cite para Word

Este add-in usa Office.js para inserir citações no cursor do Word. Ele lê o arquivo `bibliography.json` publicado pelo Cite no GitHub.

## 1. Publique a bibliografia

No Cite, abra **Ferramentas → Integrações**, informe o repositório, branch, pasta e um token do GitHub com permissão de conteúdo, e clique em **Publicar no GitHub**.

O Cite grava, por exemplo:

```text
cite/bibliography.json
cite/references.bib
```

## 2. Publique o painel no GitHub Pages

Envie a pasta `integrations/word` para o repositório e ative o GitHub Pages.

Depois substitua no `manifest.xml`:

- `YOUR_GITHUB_USER`
- `YOUR_REPO`

Se o repositório usar outro caminho, ajuste também `SourceLocation` e `IconUrl`.

## 3. Instale no Word

### macOS

Copie `manifest.xml` para:

```text
~/Library/Containers/com.microsoft.Word/Data/Documents/wef/
```

Crie a pasta `wef` se ela não existir. Depois abra o Word em **Inserir → Suplementos → Meus suplementos** e escolha **Cite**.

### Windows

Abra **Arquivo → Opções → Central de Confiabilidade → Suplementos confiáveis** e adicione o catálogo ou use **Inserir → Meus Suplementos → Carregar Meu Suplemento** para selecionar o `manifest.xml`.

## 4. Use

No painel do Cite:

1. Informe a URL pública do `bibliography.json`:

```text
https://raw.githubusercontent.com/USUARIO/REPO/main/cite/bibliography.json
```

2. Clique em **Carregar**.
3. Busque a referência.
4. Escolha o estilo.
5. Clique em **Inserir citação** ou **Inserir bibliografia**.

O arquivo precisa ser público. Para repositórios privados, use uma URL assinada ou um proxy com autenticação — o add-in não guarda tokens do GitHub.
