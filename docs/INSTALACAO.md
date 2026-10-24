# Instalação e distribuição

## Artefatos

| Plataforma | Arquivo | Arquitetura | Tamanho aproximado |
| --- | --- | --- | --- |
| macOS | `Cite-0.2.0-arm64.dmg` | Apple Silicon | 118 MB |
| Windows | `Cite-Setup-0.2.0.exe` | x64 | 95 MB |

Os artefatos são gerados em `dist/` e não entram no histórico do Git. Publique-os como anexos de uma release do GitHub.

## macOS

1. Abra o DMG.
2. Arraste **Cite** para **Aplicativos**.
3. Abra o aplicativo.

O DMG não é assinado nem notarizado. Em caso de bloqueio do Gatekeeper:

- clique com o botão direito no aplicativo e escolha **Abrir**; ou
- autorize em **Ajustes do Sistema > Privacidade e Segurança**.

A biblioteca fica no diretório escolhido no primeiro uso. O arquivo que registra esse caminho é `~/Library/Application Support/Cite/storage.json`.

## Windows

1. Execute `Cite-Setup-0.2.0.exe`.
2. Percorra as telas de boas-vindas, escolha da pasta, instalação e conclusão.
3. Marque **Executar o Cite agora** se quiser abrir ao final.

O instalador:

- é x64;
- instala por usuário em `%LOCALAPPDATA%\Programs\Cite`;
- não exige privilégios de administrador;
- cria atalhos na Área de Trabalho e no Menu Iniciar;
- registra o desinstalador em **Configurações > Aplicativos**;
- preserva os dados da biblioteca ao desinstalar.

O executável não possui assinatura digital. Se o SmartScreen exibir um aviso, use **Mais informações > Executar assim mesmo**.

## Dados do usuário

Na primeira execução, o Cite cria a biblioteca em `~/Documents/Cite` sem pedir configuração e abre a tela inicial. Nela é possível abrir a biblioteca, criar uma referência, buscar artigos ou importar um PDF. Nessa pasta ficam os dados locais e a subpasta `attachments`.

Se a pasta for excluída, movida ou ficar sem permissão, o Cite mostra uma tela de recuperação. Nela é possível usar a biblioteca padrão, que cria uma pasta vazia, ou escolher outra pasta. Também é possível trocar a pasta pela tela inicial, em **Alterar pasta**.

- macOS: `~/Library/Application Support/Cite/storage.json`
- Windows: `%APPDATA%\Cite\storage.json`

Para fazer backup, use a opção **Backup** dentro do Cite ou copie a pasta da biblioteca com o aplicativo fechado.

## Integração com o Word

O add-in do Word é instalado pela tela inicial do Cite, no cartão **Cite no Word**, com o botão **Instalar no Word**. A instalação é automática no macOS:

1. o Cite gera um certificado local para `localhost` e `127.0.0.1`;
2. adiciona o certificado ao chaveiro do sistema;
3. copia o manifesto `cite-word.xml` para a pasta `wef` do Word;
4. inicia o painel em `https://localhost:23120`.

Depois, reinicie o Word e abra **Página Inicial → Suplementos → Cite**. O painel se conecta à biblioteca local direto do aplicativo, sem publicar nada no GitHub.

No macOS, o Word não mantém add-ins locais fixos na faixa de opções entre sessões. Se a aba **Cite** não estiver visível, abra **Página Inicial → Suplementos** e clique em **Cite** em **Suplementos do Desenvolvedor**. O manifesto permanece instalado; não é preciso reinstalar.

Na aba **Cite**, use **Inserir citação** para buscar e inserir uma referência no cursor, **Inserir bibliografia** para criar ou atualizar a lista e **Abrir painel** para navegar pela biblioteca. Clique em uma ou mais referências para citá-las juntas. Em **Opções da citação** ficam página, prefixo, sufixo, apud, citação narrativa e omissão de autor/ano; os atalhos incluem **grifo nosso**. O menu **Mais** traz **Preferências do documento**, **Atualizar citações** e **Desvincular citações**. Para editar uma citação existente, coloque o cursor nela e use **Editar citação do cursor** no painel.

O macOS pode pedir a senha do usuário ao confiar no certificado. É esperado: o certificado serve apenas para o painel local do Cite e não é enviado para nenhum servidor.

- Estado da integração: `~/Library/Application Support/Cite/word-addin/install.json`
- Certificado e chave: `~/Library/Application Support/Cite/word-addin/tls/`
- Manifesto instalado: `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/cite-word.xml`

No Windows, a instalação automática ainda não está disponível; siga as instruções manuais em [integrations/word/README.md](../integrations/word/README.md).

## Desinstalação

### macOS

Arraste o aplicativo para o Lixo. Os dados da biblioteca permanecem na pasta escolhida.

### Windows

Use **Configurações > Aplicativos > Cite > Desinstalar**. O desinstalador remove o aplicativo e os atalhos, mas não apaga a pasta de dados da biblioteca.

## Solução de problemas

### O macOS diz que o aplicativo está danificado

O build é não assinado. Remova o atributo de quarentena somente se você confia no arquivo:

```bash
xattr -dr com.apple.quarantine /Applications/Cite.app
```

### O Windows bloqueia a instalação

O instalador não tem certificado de assinatura de código. Use **Mais informações > Executar assim mesmo** ou configure um certificado antes de distribuir.

### O PDF não abre no Windows

Verifique se o caminho do arquivo contém caracteres especiais e se o arquivo ainda existe. O visualizador usa URLs `file:///` convertidas a partir do caminho local.

### O painel do Word não conecta

Confirme que o Cite está aberto e que o painel mostra **Conectado**. Se necessário, clique em **Reconectar**. Verifique a porta:

```bash
curl -s https://localhost:23120/ping
```

Se o certificado não estiver confiável, reinstale pela tela inicial em **Reinstalar**. Se o Word não mostrar a aba **Cite**, confirme que `cite-word.xml` está em `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/` e reinicie o Word.

### A tradução não funciona

A tradução requer internet e um serviço externo disponível. O padrão é o endpoint web do Google Translate. Se o serviço estiver bloqueado na sua rede, a tradução falhará.
