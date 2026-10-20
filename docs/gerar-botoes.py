"""Botões do README, no mesmo formato dos botões do perfil (40 px, canto 6, ícone à esquerda, Archivo 14/600).
Uso: python3 docs/gerar-botoes.py"""
import base64, os
RAIZ = os.path.dirname(os.path.abspath(__file__))
CARV, GRAF, MARF, TEAL = "#0E0F12", "#1A1C21", "#F1EAD2", "#2DD4BF"
icone = base64.b64encode(open(os.path.join(RAIZ, "../extension/icons/icon-48.png"), "rb").read()).decode()

def botao(nome, largura, rotulo, fundo, borda, icone_svg, descricao):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{largura}" height="40" viewBox="0 0 {largura} 40" role="img" aria-label="{descricao}">
<rect x=".5" y=".5" width="{largura - 1}" height="39" rx="6" fill="{fundo}" stroke="{borda}"/>
{icone_svg}
<text x="46" y="25.0" font-family="Archivo,'Helvetica Neue',Arial,sans-serif" font-size="14" font-weight="600" fill="{MARF}">{rotulo}</text>
</svg>
'''
    open(os.path.join(RAIZ, nome), "w").write(svg)

# instalar: o cassete do Talktrail
botao("btn-loja.svg", 262, "Instalar na Chrome Web Store", CARV, TEAL,
      f'<image x="14" y="9" width="22" height="22" xlink:href="data:image/png;base64,{icone}" href="data:image/png;base64,{icone}"/>',
      "Instalar o Talktrail na Chrome Web Store")
# apoiar: xícara cheia com vapor, em âmbar (a cor do café), no mesmo corpo do botão da loja
AMBAR = "#F5C84B"
xicara = (f'<g transform="translate(14,8)"><path d="M3.5 9.5h13v5.2a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" fill="{AMBAR}"/>'
          f'<path d="M16.5 11h1.6a2.7 2.7 0 0 1 0 5.4h-1.6" fill="none" stroke="{AMBAR}" stroke-width="1.8" stroke-linecap="round"/>'
          f'<path d="M7.6 3.2v3.2M12.2 3.2v3.2" stroke="{AMBAR}" stroke-width="1.8" stroke-linecap="round"/></g>')
botao("btn-cafe.svg", 190, "Pague um café", CARV, AMBAR, xicara, "Apoiar o Talktrail com um café")
print("ok")
