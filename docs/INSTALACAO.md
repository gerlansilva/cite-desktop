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

O Cite pergunta a pasta da biblioteca na primeira execução. Nessa pasta ficam os dados locais e a subpasta `attachments`.

- macOS: `~/Library/Application Support/Cite/storage.json`
- Windows: `%APPDATA%\Cite\storage.json`

Para fazer backup, use a opção **Backup** dentro do Cite ou copie a pasta da biblioteca com o aplicativo fechado.

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

### A tradução não funciona

A tradução requer internet e um serviço externo disponível. O padrão é o endpoint web do Google Translate. Se o serviço estiver bloqueado na sua rede, a tradução falhará.
