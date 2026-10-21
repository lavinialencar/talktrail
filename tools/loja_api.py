#!/usr/bin/env python3
"""Fala com a API da Chrome Web Store (v2): mostra o estado, cancela a análise pendente, sobe um pacote e pede a revisão.
Usado pelo fluxo do GitHub (publicar-loja.yml). Credenciais vêm do ambiente: CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, PUBLISHER_ID, EXTENSION_ID.
Uso: python3 tools/loja_api.py estado
     python3 tools/loja_api.py reenviar dist/talktrail-1.21.15.zip   (cancela análise pendente, sobe o zip e publica depois da revisão)"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

PUB = os.environ["PUBLISHER_ID"]
ITEM = os.environ["EXTENSION_ID"]
NOME = f"publishers/{PUB}/items/{ITEM}"
BASE = "https://chromewebstore.googleapis.com"


def chamar(metodo, url, token, corpo=None, tipo="application/json"):
    cab = {"Authorization": f"Bearer {token}"}
    if corpo is not None:
        cab["Content-Type"] = tipo
    req = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            dados = r.read()
            return r.status, (json.loads(dados) if dados else {})
    except urllib.error.HTTPError as e:
        dados = e.read()
        try:
            return e.code, json.loads(dados)
        except ValueError:
            return e.code, {"erro_bruto": dados[:300].decode("utf-8", "replace")}


def token_de_acesso():
    corpo = urllib.parse.urlencode({
        "client_id": os.environ["CLIENT_ID"], "client_secret": os.environ["CLIENT_SECRET"],
        "refresh_token": os.environ["REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", corpo), timeout=60) as r:
        return json.load(r)["access_token"]


def estado(token):
    st, d = chamar("GET", f"{BASE}/v2/{NOME}:fetchStatus", token)
    print("estado", st, json.dumps(d, ensure_ascii=False)[:900])
    return st, d


def reenviar(token, zip_caminho):
    st, d = estado(token)
    if st != 200:
        sys.exit("não consegui ler o estado da loja")
    pendente = json.dumps(d)
    if "PENDING_REVIEW" in pendente or "IN_REVIEW" in pendente:
        st, d = chamar("POST", f"{BASE}/v2/{NOME}:cancelSubmission", token, b"{}")
        print("cancelar análise", st, json.dumps(d, ensure_ascii=False)[:300])
        if st != 200:
            sys.exit("não consegui cancelar a análise pendente")
        time.sleep(5)
    else:
        print("nenhuma análise pendente para cancelar")
    with open(zip_caminho, "rb") as f:
        dados = f.read()
    st, d = chamar("POST", f"{BASE}/upload/v2/{NOME}:upload", token, dados, "application/zip")
    print("subir pacote", st, json.dumps(d, ensure_ascii=False)[:400])
    if st != 200:
        sys.exit("o envio do pacote falhou")
    # o envio é assíncrono: espera o estado ficar SUCCEEDED
    for _ in range(30):
        if d.get("uploadState") == "SUCCEEDED":
            break
        if d.get("uploadState") == "FAILED":
            sys.exit("o pacote foi recusado: " + json.dumps(d, ensure_ascii=False)[:400])
        time.sleep(4)
        _, d = chamar("GET", f"{BASE}/v2/{NOME}:fetchStatus", token)
        d = d.get("lastAsyncUploadState") and {"uploadState": d["lastAsyncUploadState"]} or d
    else:
        sys.exit("o pacote não terminou de subir a tempo")
    st, d = chamar("POST", f"{BASE}/v2/{NOME}:publish", token, json.dumps({"publishType": "DEFAULT_PUBLISH"}).encode())
    print("pedir revisão e publicar depois", st, json.dumps(d, ensure_ascii=False)[:400])
    if st != 200:
        sys.exit("não consegui enviar para revisão")
    estado(token)


if __name__ == "__main__":
    tok = token_de_acesso()
    if len(sys.argv) >= 2 and sys.argv[1] == "estado":
        estado(tok)
    elif len(sys.argv) >= 3 and sys.argv[1] == "reenviar":
        reenviar(tok, sys.argv[2])
    else:
        sys.exit(__doc__)
