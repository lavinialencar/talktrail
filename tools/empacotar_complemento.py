#!/usr/bin/env python3
"""Monta os três zips do complemento (servidor local) pra anexar na Release do GitHub.

Um zip por sistema, com o mesmo conteúdo que o botão do painel monta no build de desenvolvimento:
o instalador do sistema, o servidor e o LEIA-ME. O pacote da loja não leva esses arquivos (scripts não passam na revisão),
então o painel baixa daqui: https://github.com/lavinialencar/talktrail/releases/latest/download/Talktrail-complemento-<sistema>.zip
Uso: python3 tools/empacotar_complemento.py [pasta-de-saida]   (padrão: dist/)"""
import os, sys, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPLEMENTO = os.path.join(RAIZ, "extension", "complemento")
SERVIDOR = os.path.join(RAIZ, "server", "talktrail_server.py")

# sistema -> (arquivo de origem, nome dentro do zip, modo)
INSTALADORES = {
    "mac": ("instalar-mac.command", "Instalar Talktrail.command", 0o755),
    "windows": ("instalar-windows.bat", "Instalar Talktrail.bat", 0o644),
    "linux": ("instalar-linux.sh", "instalar-talktrail.sh", 0o755),
}


def ler(nome):
    with open(os.path.join(COMPLEMENTO, nome), "rb") as f:
        return f.read()


def adicionar(z, nome, dados, modo):
    info = zipfile.ZipInfo(nome, date_time=(2026, 1, 1, 0, 0, 0))  # data fixa: o mesmo zip sempre sai igual
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3  # unix, pra o modo (executável) valer no Mac e no Linux
    info.external_attr = (0o100000 | modo) << 16
    z.writestr(info, dados)


def main(saida):
    if ler("talktrail_server.py") != open(SERVIDOR, "rb").read():
        sys.exit("extension/complemento/talktrail_server.py está diferente de server/talktrail_server.py. Rode: npm run sincronizar")
    os.makedirs(saida, exist_ok=True)
    for so, (origem, nome, modo) in INSTALADORES.items():
        dados = ler(origem)
        if so == "windows":  # o .bat quer CRLF
            dados = dados.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        caminho = os.path.join(saida, f"Talktrail-complemento-{so}.zip")
        with zipfile.ZipFile(caminho, "w") as z:
            adicionar(z, nome, dados, modo)
            adicionar(z, "talktrail_server.py", ler("talktrail_server.py"), 0o644)
            adicionar(z, "LEIA-ME.txt", ler("LEIA-ME.txt"), 0o644)
        print(f"ok: {caminho} ({os.path.getsize(caminho) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "dist"))
