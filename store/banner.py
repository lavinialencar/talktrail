"""Banner do README (1280x400) e pré-visualização social do GitHub (1280x640).
Uso: servidor estático na raiz (python3 -m http.server 8799) e python3 store/banner.py"""
import os, re, subprocess
RAIZ = os.path.dirname(os.path.abspath(__file__))
HELIUM = "/Applications/Helium.app/Contents/MacOS/Helium"
CARV, MARF, TEAL = "#0E0F12", "#E7DFC7", "#2DD4BF"
logo = open(os.path.join(RAIZ, "../design/logo-final/fita-completo.svg")).read()
logo = re.sub(r'\s(width|height)="\d+"', "", logo, count=2)
GRAO = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'>"
        "<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>"
        "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")

def pagina(nome, w, h, titulo, fonte_tag, logo_px, painel):
    html = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>
*{{box-sizing:border-box;margin:0}}html,body{{background:{CARV}}}
body{{width:{w}px;height:{h}px;position:relative;overflow:hidden;color:{MARF};font-family:'IBM Plex Sans',sans-serif;-webkit-font-smoothing:antialiased}}
body::after{{content:"";position:absolute;inset:0;background:url("{GRAO}");opacity:.07;mix-blend-mode:screen}}
.slab{{position:absolute;right:0;top:0;bottom:0;width:{int(w*0.40)}px;background:{MARF}}}
h1{{font-family:'Archivo';font-weight:900;letter-spacing:-.03em;line-height:.9;font-size:{titulo}px}}
.logo{{position:absolute;width:{logo_px}px;height:{logo_px}px}}.logo svg{{width:100%;height:100%}}
.painel{{position:absolute;border-radius:14px;border:2px solid {CARV};box-shadow:12px 12px 0 {CARV}}}
</style></head><body>
<div class="slab"></div>
{painel}
<div class="logo" style="right:{int(w*0.40*0.5-logo_px*0.5)+40}px;top:{(h-logo_px)//2-10}px;transform:rotate(-4deg)">{logo}</div>
<div style="position:absolute;left:{int(w*0.055)}px;top:0;bottom:0;width:{int(w*0.52)}px;display:flex;flex-direction:column;justify-content:center">
  <h1>Talktrail</h1>
  <p style="font-size:{fonte_tag}px;line-height:1.3;color:#cfc9b6;margin-top:{int(h*0.05)}px;text-wrap:balance">Transcrição do Google Meet,<br>só no seu computador.</p>
  <p style="font:600 {int(fonte_tag*0.78)}px 'IBM Plex Sans';margin-top:{int(h*0.045)}px;color:{TEAL}">Sem conta. Sem nuvem. Sem telemetria.</p>
</div></body></html>"""
    open(os.path.join(RAIZ, "src", nome + ".html"), "w").write(html)
    saida = os.path.join(RAIZ, "..", "docs", nome + ".png")
    subprocess.run([HELIUM, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=5000",
                    f"--screenshot={saida}", f"http://127.0.0.1:8799/store/src/{nome}.html"], capture_output=True, timeout=90)

P = lambda w, h, x, y, rot: (f'<img class="painel" src="../painel/texto.png" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
                              f'object-fit:cover;object-position:top;transform:rotate({rot}deg)">')
# social 1280x640: painel espiando à direita, logo grande
pagina("social-preview", 1280, 640, 150, 34, 340, P(250, 475, 1010, 250, 3))
# README 1280x400: mais baixo, sem painel
pagina("banner", 1280, 400, 118, 28, 270, "")
print("ok")
