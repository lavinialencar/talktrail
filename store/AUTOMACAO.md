# Publicar na loja pelo GitHub (sem mexer no painel do Google)

O arquivo `.github/workflows/publicar-loja.yml` envia o Talktrail pra Chrome Web Store sozinho quando você cria uma tag de versão.

## Como usar (depois de configurar as credenciais, abaixo)
1. Mude `"version"` em `extension/manifest.json` (tem que ser maior que a publicada) e faça o commit.
2. `git tag v1.21.7 && git push origin v1.21.7` (o número da tag tem que ser o do manifest, senão o fluxo para).
3. O GitHub roda os testes, monta o pacote, cria uma Release com o zip e envia pra loja já pedindo a revisão.
4. A Google revisa como sempre (dias). O resultado chega por e-mail.

Sem as credenciais, o fluxo só monta o zip e anexa na Release, e avisa que nada foi enviado. Também dá pra rodar à mão em Actions > Publicar na Chrome Web Store > Run workflow (marque "enviar" só se quiser mesmo enviar).

## Credenciais (uma vez só, é você que faz)
A API da loja pede um acesso seu. Os três valores (`CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`) ficam como **segredos** do repositório, nunca em arquivo. Os nomes que você digita no Google não importam: o app só você usa. Leva uns 10 minutos.

1. Entre com a conta Google que é DONA da extensão na loja em https://console.developers.google.com/apis/credentials e **crie um projeto** (nome: `chrome-webstore-upload`).
2. Abra https://console.cloud.google.com/auth/overview, clique em **Get started** (Começar), ponha um nome de app (`chrome-webstore-upload`) e o seu e-mail.
3. Em público (Audience), escolha **External** (Externo). *Interno só existe em conta de empresa (Workspace).* Preencha o que for obrigatório até o botão **Create** liberar.
4. Em **Audience**, adicione o seu e-mail em "Test users" e clique em **Publish app** (Publicar app, "In production"). Isso é importante: em modo de teste o token expira em 7 dias e a automação para de funcionar. Para uso só seu não precisa de verificação do Google (vai aparecer um aviso de "app não verificado" quando você autorizar: é normal, é o seu app).
5. Clique em **Create OAuth client**, tipo **Desktop app**, nome `Chrome Webstore Upload`. Anote o **ID do cliente** (`CLIENT_ID`).
6. Abra o cliente criado, e no ícone de informação copie a **chave secreta** (`CLIENT_SECRET`).
7. Abra https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com e clique em **Enable** (Ativar).
8. No seu terminal, rode `npx chrome-webstore-upload-keys`. Ele pede o `CLIENT_ID` e o `CLIENT_SECRET`, abre uma página do Google (clique em permitir, mesmo com o aviso de app não verificado) e mostra o **`REFRESH_TOKEN`** no terminal.
9. Guarde os três como segredos do repositório (no terminal, cada comando pergunta o valor e não mostra na tela):
   ```
   gh secret set CWS_CLIENT_ID --repo lavinialencar/talktrail
   gh secret set CWS_CLIENT_SECRET --repo lavinialencar/talktrail
   gh secret set CWS_REFRESH_TOKEN --repo lavinialencar/talktrail
   ```
   (ou pelo site: repositório > Settings > Secrets and variables > Actions > New repository secret, com esses mesmos nomes.)

O ID da extensão (`jneejlpdlldinjnilghnndennbnpbeak`) já está no arquivo do fluxo.

## Cuidados
- Segredo vazou (colou em lugar errado)? No Google Cloud, apague a credencial e crie outra; troque o segredo no GitHub.
- O fluxo usa uma ferramenta de terceiros (`chrome-webstore-upload-cli`, versão fixa 3.5.0) só pra falar com a API da loja.
- A publicação automática pede revisão a cada versão, igual ao painel. Se a Google reprovar, o e-mail explica o motivo.
