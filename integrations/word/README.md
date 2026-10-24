# Add-in do Cite para Word

![Cite no Word](../../docs/images/word.png)

O add-in adiciona uma aba **Cite** à faixa de opções do Word, ao lado de abas como **Zotero**. O painel se conecta à biblioteca local do Cite por HTTPS em `localhost`, sem publicar nada no GitHub e sem depender de internet.

## Recursos

- Aba **Cite** com os comandos:
  - **Inserir citação** — busca uma referência e insere a citação no cursor.
  - **Inserir bibliografia** — insere ou atualiza a lista completa no documento.
  - **Abrir painel** — abre a biblioteca para navegar e inserir.
  - **Mais → Preferências do documento** — escolhe o estilo, a origem da bibliografia e a atualização automática.
  - **Mais → Atualizar citações** — reformata todas as citações e a bibliografia com o estilo atual.
  - **Mais → Desvincular citações** — converte os campos em texto comum.
- Conexão local com o aplicativo Cite aberto no mesmo computador.
- Estilos ABNT, APA, MLA, Harvard, Vancouver e Chicago.
- Citação no texto no formato autor-data, adequada ao estilo escolhido; Vancouver usa numeração por ordem de citação.
- Regras de autores por estilo: ABNT lista até três e usa `et al.` a partir de quatro; APA usa `et al.` a partir de três; MLA idem; Harvard usa `and` para dois e `et al.` a partir de três; Chicago lista três e usa `et al.` a partir de quatro.
- Citações e bibliografia como campos vinculados (`cite:citation:<id>` e `cite:bibliography`).
- Edição de citação existente: com o cursor dentro do campo, escolher outra referência substitui a citação.
- Cartão **Documento** no painel com contagem de campos, atualização automática e ações de atualizar/desvincular.
- Busca por título, autor, ano, periódico, DOI ou citação formatada.
- Atualização automática da lista enquanto o Cite está aberto.
- Modo alternativo com `bibliography.json` publicado, para quando o aplicativo estiver fechado.

## Como funciona

O Word não permite que um add-in leia arquivos locais. Por isso o próprio Cite serve o painel e os dados em `https://localhost:23120`, com um certificado local confiável. O manifesto do add-in aponta para essa URL, e o painel consulta `/ping` e `/library` no mesmo host — a conexão fica sempre no computador, sem GitHub e sem servidor externo.

Ao instalar pela tela inicial, o Cite:

1. gera um certificado para `localhost` e `127.0.0.1`;
2. adiciona o certificado ao chaveiro do sistema;
3. copia `cite-word.xml` para a pasta `wef` do Word;
4. inicia o servidor do painel na primeira porta livre entre 23120 e 23129.

Se a porta mudar, o manifesto é reescrito automaticamente. O estado fica em `~/Library/Application Support/Cite/word-addin/`.

## Instalar no macOS

1. Abra o Cite.
2. Na tela inicial, clique em **Instalar no Word** no cartão **Cite no Word**.
3. Aguarde o status **Instalado · https://localhost:23120**.
4. Feche e reabra o Word.
5. Abra **Página Inicial → Suplementos → Cite**.

O macOS pode pedir a senha do usuário ao confiar no certificado. É esperado: o certificado é local e serve apenas para o painel do Cite.

Se o cartão mostrar **Instalação automática disponível no Word para macOS**, a integração não está disponível nesta plataforma.

## Instalar no Windows

O manifesto é o mesmo, mas a instalação automática do certificado e da pasta do Word ainda não está implementada no instalador. O fluxo manual:

1. Abra o Cite e clique em **Instalar no Word** para gerar o certificado e iniciar o painel.
2. Confie no certificado com:

```bat
certutil -addstore -user Root "%APPDATA%\Cite\word-addin\tls\word-cert.pem"
```

3. Copie `%APPDATA%\Cite\word-addin\wef\cite-word.xml` (ou o manifesto gerado em `integrations/word/`) para uma pasta local.
4. No Word, abra **Arquivo → Opções → Central de Confiabilidade → Suplementos Confiáveis** e adicione a pasta como catálogo, ou use **Inserir → Meus Suplementos → Carregar Meu Suplemento**.

## Abrir o add-in

1. Abra **Página Inicial → Suplementos**.
2. Em **Suplementos do Desenvolvedor**, clique em **Cite**.
3. A aba **Cite** aparece na faixa de opções e o painel é aberto.
4. O painel mostra **Conectado** e o caminho da biblioteca.

## Se a aba Cite não aparecer

No macOS, o Word lista os suplementos carregados pelo manifesto em **Página Inicial → Suplementos**. Se a aba **Cite** não estiver na faixa de opções depois de reabrir o Word:

1. abra **Página Inicial → Suplementos**;
2. em **Suplementos do Desenvolvedor**, clique em **Cite**;
3. a aba e o painel voltam a aparecer.

O manifesto continua instalado; não é preciso reinstalar. Esse comportamento é do Word para macOS, que não mantém add-ins locais fixos na faixa de opções entre sessões.

## Citações vinculadas

As citações e a bibliografia são gravadas em content controls do Word com as etiquetas `cite:citation:<ids>` e `cite:bibliography`. O vínculo permite reformatar o documento sem reinserir cada citação.

- **Inserir citação**: sem campo sob o cursor, insere uma nova citação vinculada. Com o cursor dentro de uma citação existente, substitui a referência mantendo o vínculo.
- **Inserir bibliografia**: cria o campo de bibliografia ou atualiza o texto do campo existente.
- **Atualizar citações**: percorre todos os campos e aplica o estilo escolhido, inclusive a ordenação da bibliografia.
- **Desvincular citações**: remove os campos e mantém o texto, que deixa de ser atualizado pelo Cite.

A contagem de citações e bibliografias aparece no cartão **Documento** do painel. A atualização automática é opcional; desmarque **Atualizar citações automaticamente** para evitar reformatações enquanto edita o texto.

No estilo **Vancouver**, as citações são numéricas `(1)`, `(2)` e a bibliografia é numerada na ordem de primeira citação. Ao inserir, remover ou reordenar citações, **Atualizar citações** refaz a numeração e a ordem da lista.

## Usar a bibliografia publicada

Quando o Cite não está aberto, o painel oferece o modo alternativo:

1. No Cite, abra **Ferramentas → Integrações**.
2. Informe o repositório, a branch, a pasta e um token do GitHub com permissão de conteúdo.
3. Clique em **Publicar no GitHub**.
4. No painel do Word, abra **Sem o aplicativo aberto: bibliografia publicada** e cole a URL pública do `bibliography.json`, por exemplo:

```text
https://raw.githubusercontent.com/USUARIO/REPO/main/cite/bibliography.json
```

O arquivo precisa ser público e permitir CORS. Para repositórios privados, use uma URL assinada ou um proxy com autenticação, porque o add-in não guarda tokens do GitHub.

## Desenvolvimento

O modo de desenvolvimento usa o mesmo servidor do aplicativo:

```bash
npm start
```

O servidor do painel sobe junto e fica em `https://localhost:23120/taskpane.html`. Para abrir sem biblioteca, use `?demo=1`.

Para testar apenas o add-in:

```bash
npm run word:serve
```

Esse servidor usa `integrations/word/manifest.localhost.xml` na porta 3000 e serve o exemplo.

Para instalar o manifesto manualmente no macOS:

```bash
mkdir -p ~/Library/Containers/com.microsoft.Word/Data/Documents/wef
cp integrations/word/manifest.local-server.xml \
  ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/cite-word.xml
```

O `manifest.local-server.xml` contém `__PORT__`, substituído pelo Cite na instalação.

Se o macOS bloquear o acesso à pasta do Word, use o Finder:

1. Abra **Ir → Ir para a Pasta**.
2. Digite `~/Library/Containers/com.microsoft.Word/Data/Documents`.
3. Crie a pasta `wef`, se necessário.
4. Copie o manifesto para dentro dela.

## Arquivos

```text
manifest.xml               manifesto de produção, com placeholders
manifest.local-server.xml  manifesto local com __PORT__, usado na instalação
manifest.localhost.xml     manifesto de desenvolvimento na porta 3000
taskpane.html/js           painel do Word
fields.js                  formatação e content controls de citação e bibliografia
commands.html/js           FunctionFile dos comandos Atualizar e Desvincular
demo-bibliography.json     bibliografia fictícia para demonstração
assets/                    ícones do add-in (16, 32 e 80 px)
```

## Limitações

- O add-in precisa do Cite aberto para a conexão local; sem ele, só a bibliografia publicada funciona.
- O painel precisa estar em HTTPS confiável.
- A edição de uma citação substitui a referência inteira; não há editor de prefixo, sufixo ou supressão de autor.
- Não há notas de rodapé nem anotações vinculadas ao documento.
- A instalação automática do manifesto está disponível apenas no Word para macOS.
- O build do add-in não é assinado nem publicado na Office Store.
