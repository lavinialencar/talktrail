# Publicar na loja pelo GitHub (sem mexer no painel do Google)

O arquivo `.github/workflows/publicar-loja.yml` envia o Talktrail pra Chrome Web Store sozinho quando você cria uma tag de versão.

## Como usar (depois de configurar as credenciais, abaixo)
1. Mude `"version"` em `extension/manifest.json` (tem que ser maior que a publicada) e faça o commit.
2. `git tag v1.21.7 && git push origin v1.21.7` (o número da tag tem que ser o do manifest, senão o fluxo para).
3. O GitHub roda os testes, monta o pacote, cria uma Release com o zip e envia pra loja já pedindo a revisão.
4. A Google revisa como sempre (dias). O resultado chega por e-mail.

Sem as credenciais, o fluxo só monta o zip e anexa na Release, e avisa que nada foi enviado. Também dá pra rodar à mão em Actions > Publicar na Chrome Web Store > Run workflow (marque "enviar" só se quiser mesmo enviar).

## Credenciais (uma vez só, é você que faz)
A API da loja pede um acesso seu. Os quatro valores ficam como **segredos** do repositório (nunca em arquivo):

1. Entre em https://console.cloud.google.com com a MESMA conta Google que é dona da extensão na loja.
2. Crie um projeto (nome livre, ex.: "talktrail-loja") e ative a **Chrome Web Store API** (APIs e serviços > Biblioteca).
3. APIs e serviços > **Tela de consentimento OAuth**: tipo Externo, nome do app "Talktrail loja", seu e-mail. Em "Usuários de teste", adicione o seu próprio e-mail. Pode deixar em modo de teste.
4. APIs e serviços > Credenciais > **Criar credenciais > ID do cliente OAuth** > tipo "App para computador". Anote o **ID do cliente** e a **chave secreta do cliente**.
5. Gere o **refresh token** (o código que deixa o GitHub agir como você): com o ID e a chave do passo 4, rode no terminal
   `npx chrome-webstore-upload-keys` e siga as instruções (abre uma página do Google pedindo permissão; o token aparece no terminal). Guarde só no passo 6.
6. No GitHub: repositório > Settings > Secrets and variables > Actions > **New repository secret**, três vezes:
   - `CWS_CLIENT_ID`: o ID do cliente
   - `CWS_CLIENT_SECRET`: a chave secreta do cliente
   - `CWS_REFRESH_TOKEN`: o refresh token

O ID da extensão (`jneejlpdlldinjnilghnndennbnpbeak`) já está no arquivo do fluxo.

## Cuidados
- Segredo vazou (colou em lugar errado)? No Google Cloud, apague a credencial e crie outra; troque o segredo no GitHub.
- O fluxo usa uma ferramenta de terceiros (`chrome-webstore-upload-cli`, versão fixa 3.5.0) só pra falar com a API da loja.
- A publicação automática pede revisão a cada versão, igual ao painel. Se a Google reprovar, o e-mail explica o motivo.
