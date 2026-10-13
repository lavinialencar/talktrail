#!/usr/bin/env python3
"""Monta o pacote da Chrome Web Store a partir de extension/.

Fora do pacote: o instalador (complemento/), a recarga de desenvolvimento (dev-hot.js) e o version_name "dev".
Uso: python3 tools/empacotar.py [pasta-de-saida]   (padrão: dist/)
Sai com erro se sobrar algo que não deveria ir pra loja."""
import json, os, re, shutil, sys, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEM = os.path.join(RAIZ, "extension")
FORA = {"complemento", "dev-hot.js"}
PERMISSOES_PROIBIDAS = {"tabs", "management", "<all_urls>"}


def main(saida):
    manifesto = json.load(open(os.path.join(ORIGEM, "manifest.json"), encoding="utf-8"))
    versao = manifesto["version"]
    pasta = os.path.join(saida, f"talktrail-{versao}")
    if os.path.exists(pasta):
        shutil.rmtree(pasta)
    shutil.copytree(ORIGEM, pasta, ignore=lambda d, nomes: [n for n in nomes if n in FORA or n == ".DS_Store" or n.endswith(".map")])
    manifesto.pop("version_name", None)
    bg = os.path.join(pasta, "background.js")
    txt = open(bg, encoding="utf-8").read()
    txt = re.sub(r"// só no build de desenvolvimento.*?importScripts\('dev-hot\.js'\);\n", "", txt, flags=re.S)
    open(bg, "w", encoding="utf-8").write(txt)
    json.dump(manifesto, open(os.path.join(pasta, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # conferências: o que a loja não pode ver
    erros = []
    if set(manifesto.get("permissions", [])) & PERMISSOES_PROIBIDAS:
        erros.append("permissão proibida no manifest")
    for raiz, _, arquivos in os.walk(pasta):
        for a in arquivos:
            rel = os.path.relpath(os.path.join(raiz, a), pasta)
            if rel.endswith((".command", ".bat", ".sh", ".py")):
                erros.append(f"script executável no pacote: {rel}")
            if rel.endswith(".js") and "vendor" not in rel:
                t = open(os.path.join(raiz, a), encoding="utf-8").read()
                if "extversao" in t or "dev-hot" in t:
                    erros.append(f"resto de recarga de desenvolvimento em {rel}")
    if erros:
        sys.exit("PACOTE REPROVADO:\n- " + "\n- ".join(erros))

    zip_caminho = pasta + ".zip"
    with zipfile.ZipFile(zip_caminho, "w", zipfile.ZIP_DEFLATED) as z:
        for raiz, _, arquivos in os.walk(pasta):
            for a in sorted(arquivos):
                cheio = os.path.join(raiz, a)
                z.write(cheio, os.path.relpath(cheio, pasta))
    print(f"ok: {zip_caminho} ({os.path.getsize(zip_caminho) // 1024} KB)")
    return zip_caminho


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "dist"))
