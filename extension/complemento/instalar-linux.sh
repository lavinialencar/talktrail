#!/bin/bash
# Instala o complemento do Talktrail (a pasta ao vivo em Documentos/Talktrail).
cd "$(dirname "$0")" || exit 1
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/talktrail"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Falta o Python 3. Instale pelo gerenciador de pacotes (ex.: sudo apt install python3) e rode de novo."
  exit 1
fi
mkdir -p "$DEST" || exit 1
cp -f talktrail_server.py "$DEST/talktrail_server.py" || exit 1
python3 "$DEST/talktrail_server.py" --instalar
echo "Pronto. O Talktrail salva em Documentos/Talktrail."
