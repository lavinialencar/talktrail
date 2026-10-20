#!/bin/bash
# Instala o complemento do Talktrail (a pasta ao vivo em Documentos/Talktrail). Um clique, uma vez.
cd "$(dirname "$0")" || exit 1
DEST="$HOME/Library/Application Support/Talktrail"
echo ""
echo "Instalando o complemento do Talktrail... / Installing the Talktrail add-on..."
echo ""

PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
    PY="$(command -v "$c")"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "Falta o Python 3 neste Mac. Vou abrir a página pra baixar. Instale, e depois abra este arquivo de novo."
  echo "Python 3 is missing on this Mac. I will open the download page. Install it, then open this file again."
  open "https://www.python.org/downloads/"
  echo ""
  read -n 1 -s -r -p "Tecle qualquer tecla pra fechar. / Press any key to close."
  exit 1
fi

mkdir -p "$DEST" || exit 1
cp -f talktrail_server.py "$DEST/talktrail_server.py" || exit 1
"$PY" "$DEST/talktrail_server.py" --instalar
echo ""
echo "Pronto. Volte pro navegador: o Talktrail já salva em Documentos/Talktrail."
echo "Done. Go back to your browser: Talktrail now saves to Documents/Talktrail."
read -n 1 -s -r -p "Tecle qualquer tecla pra fechar. / Press any key to close."
