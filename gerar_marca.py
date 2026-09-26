"""
Gera os arquivos de marca do site a partir do logo vetorial oficial.

Origem:  identidade_visual/Logo AG PORTUGUES.pdf  (4 páginas, vetorial)
         identidade_visual/5.jpg                  (logo branco sobre azul, quadrado)
Destino: site/public/marca/   logos em SVG (azul e branco), símbolo, arco, trama
         site/public/         favicon.svg, favicon.ico, apple-touch-icon.png
         site/src/lib/arte/arcos-do-simbolo.ts   os 3 arcos do símbolo (para a arte animada)

Nada é redesenhado: os SVG são o próprio vetor do PDF, só recortados e recoloridos
(azul oficial #154D7D ou branco). Como rodar:  python gerar_marca.py
"""

import io
import re
import shutil
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

BASE = Path(__file__).resolve().parent
ORIGEM = BASE / "identidade_visual"
PDF = ORIGEM / "Logo AG PORTUGUES.pdf"
PUBLICO = BASE / "site" / "public"
MARCA = PUBLICO / "marca"
ARTE_TS = BASE / "site" / "src" / "lib" / "arte" / "arcos-do-simbolo.ts"

AZUL = "#154D7D"   # azul oficial (manual, seção 2)
BRANCO = "#FFFFFF"

# Páginas do PDF (conferidas visualmente)
PAGINAS = {
    "nome-completo-horizontal": 0,
    "nome-completo-vertical": 1,
    "smi-horizontal": 2,
    "smi-vertical": 3,
}


def caixa_do_desenho(svg: str, folga=0.004):
    """Retângulo que contém tudo o que foi desenhado (medido renderizando o SVG)."""
    doc = pymupdf.open(stream=svg.encode(), filetype="svg")
    pagina = doc[0]
    escala = 6
    pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=True)
    alfa = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, 3]
    ys, xs = np.nonzero(alfa > 8)
    x0, x1 = xs.min() / escala, (xs.max() + 1) / escala
    y0, y1 = ys.min() / escala, (ys.max() + 1) / escala
    f = max(x1 - x0, y1 - y0) * folga  # folga mínima para o serrilhado não cortar
    return x0 - f, y0 - f, x1 + f, y1 + f


def recortar(svg: str, caixa, titulo: str):
    """Troca o tamanho da página pelo tamanho do desenho e adiciona um título acessível."""
    x0, y0, x1, y1 = caixa
    w, h = x1 - x0, y1 - y0
    svg = re.sub(r'width="[\d.]+" height="[\d.]+" viewBox="[^"]+"',
                 f'width="{w:.2f}" height="{h:.2f}" viewBox="{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}"', svg, count=1)
    svg = svg.replace('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ', "")
    svg = re.sub(r"(<svg[^>]*>)", rf'\1<title>{titulo}</title>', svg, count=1)
    return svg


def colorir(svg: str, cor: str):
    return re.sub(r'fill="#[0-9a-fA-F]{6}"', f'fill="{cor}"', svg)


def svg_da_pagina(doc, n):
    return doc[n].get_svg_image(text_as_path=True)


def caminhos(svg: str):
    return re.findall(r'<path transform="([^"]+)" d="([^"]+)"[^>]*fill="#[0-9a-fA-F]{6}"[^>]*/>', svg)


def svg_simples(partes, caixa, cor, titulo):
    corpo = "".join(f'<path transform="{t}" d="{d}" fill="{cor}" fill-rule="evenodd"/>' for t, d in partes)
    x0, y0, x1, y1 = caixa
    w, h = x1 - x0, y1 - y0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.2f}" height="{h:.2f}" '
            f'viewBox="{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}"><title>{titulo}</title>{corpo}</svg>')


# ---------- leitura das curvas (para a arte e para o arco) ----------

def pontos_absolutos(transform: str, d: str):
    """Converte o caminho para coordenadas da página (aplica o transform) e devolve
    comandos [(letra, [x, y, ...])]. O PDF usa só comandos absolutos: M L C H V Z."""
    a, b, c, dd, e, f = map(float, re.findall(r"-?[\d.]+", transform))
    fichas = re.findall(r"[MLCHVZ]|-?\d*\.\d+|-?\d+", d)
    cmds, i, x, y = [], 0, 0.0, 0.0
    while i < len(fichas):
        letra = fichas[i]
        i += 1
        n = {"M": 2, "L": 2, "C": 6, "H": 1, "V": 1, "Z": 0}[letra]
        while True:
            if n == 0:
                cmds.append(("Z", []))
                break
            nums = list(map(float, fichas[i:i + n]))
            i += n
            if letra == "H":
                x = nums[0]
                letra_out, xy = "L", [x, y]
            elif letra == "V":
                y = nums[0]
                letra_out, xy = "L", [x, y]
            else:
                letra_out, xy = letra, nums
                x, y = nums[-2], nums[-1]
            pts = []
            for k in range(0, len(xy), 2):
                px, py = xy[k], xy[k + 1]
                pts += [a * px + c * py + e, b * px + dd * py + f]
            cmds.append((letra_out, pts))
            if i >= len(fichas) or re.match(r"[A-Z]", fichas[i]):
                break
            if letra == "M":
                letra = "L"  # números extras depois de M valem como L
    return cmds


def para_d(cmds, cx, cy, s):
    """Monta o texto do caminho, centralizado em (cx, cy) e dividido pela escala s."""
    partes = []
    for letra, pts in cmds:
        nums = " ".join(f"{(v - (cx if k % 2 == 0 else cy)) / s:.4f}" for k, v in enumerate(pts))
        partes.append(letra + (" " + nums if nums else ""))
    return " ".join(partes)


def main():
    MARCA.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDF)

    # 1. Logos completos, azul e branco
    for nome, n in PAGINAS.items():
        bruto = svg_da_pagina(doc, n)
        caixa = caixa_do_desenho(bruto)
        titulo = "Sociedade Missionária Internacional" if "nome" in nome else "SMI — Sociedade Missionária Internacional"
        for sufixo, cor in (("azul", AZUL), ("branco", BRANCO)):
            (MARCA / f"{nome}-{sufixo}.svg").write_text(recortar(colorir(bruto, cor), caixa, titulo), encoding="utf-8")

    # 2. Símbolo sozinho = primeira peça da versão "SMI" horizontal
    pagina_smi = svg_da_pagina(doc, PAGINAS["smi-horizontal"])
    simbolo = caminhos(pagina_smi)[0]
    rascunho = svg_simples([simbolo], (0, 0, 792, 612), AZUL, "")
    caixa_simbolo = caixa_do_desenho(rascunho)
    for sufixo, cor in (("azul", AZUL), ("branco", BRANCO)):
        (MARCA / f"simbolo-{sufixo}.svg").write_text(
            svg_simples([simbolo], caixa_simbolo, cor, "Símbolo da SMI"), encoding="utf-8")

    # 3. Os 3 arcos do símbolo (as "velas"; as outras 2 peças são o livro)
    transform, d = simbolo
    subcaminhos = [s for s in re.split(r"(?=M)", d) if s.strip()][:3]
    arcos = [pontos_absolutos(transform, s) for s in subcaminhos]
    x0, y0, x1, y1 = caixa_simbolo
    cx, cy, altura = (x0 + x1) / 2, (y0 + y1) / 2, y1 - y0

    # 3a. "Elemento distintivo": um arco sozinho, para marcar títulos (h2)
    arco_marcador = arcos[1]
    xs = [v for _, p in arco_marcador for v in p[0::2]]
    ys = [v for _, p in arco_marcador for v in p[1::2]]
    ax, ay, aw, ah = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    (MARCA / "arco.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ax:.2f} {ay:.2f} {aw:.2f} {ah:.2f}">'
        f'<path d="{para_d(arco_marcador, 0, 0, 1)}" fill="{AZUL}"/></svg>', encoding="utf-8")

    # 3b. Trama 2: repetição só dos arcos, em diagonal (textura; a cor é aplicada no CSS)
    arcos_d = " ".join(para_d(a, cx, cy, altura / 60) for a in arcos)
    (MARCA / "trama-2.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">'
        f'<g fill="#000"><path transform="translate(40 40)" d="{arcos_d}"/>'
        f'<path transform="translate(120 120)" d="{arcos_d}"/></g></svg>', encoding="utf-8")

    # 3c. Dados dos arcos para a arte animada (centralizados; altura do símbolo = 1)
    linhas = []
    for a in arcos:
        xs = [v for _, p in a for v in p[0::2]]
        ys = [v for _, p in a for v in p[1::2]]
        caixa = [(min(xs) - cx) / altura, (min(ys) - cy) / altura, (max(xs) - cx) / altura, (max(ys) - cy) / altura]
        linhas.append(f'  {{ d: "{para_d(a, cx, cy, altura)}", caixa: [{", ".join(f"{v:.4f}" for v in caixa)}] }},')
    ARTE_TS.write_text(
        "// GERADO por gerar_marca.py a partir do logo vetorial oficial. Não edite à mão.\n"
        "// Os 3 arcos curvos do símbolo (o \"elemento desprendido\" da Trama 2), nas posições\n"
        "// originais: centro do símbolo em (0, 0) e altura do símbolo = 1.\n"
        "// caixa = [x mínimo, y mínimo, x máximo, y máximo] de cada arco.\n"
        "export const ARCOS: { d: string; caixa: [number, number, number, number] }[] = [\n"
        + "\n".join(linhas) + "\n];\n", encoding="utf-8")

    # 4. Favicons a partir do símbolo
    favicon = svg_simples([simbolo], caixa_simbolo, AZUL, "SMI")
    # em abas escuras, o símbolo fica branco (combinação permitida: branco sobre escuro)
    favicon = favicon.replace("<title>SMI</title>", "<title>SMI</title><style>path{fill:" + AZUL +
                              "}@media (prefers-color-scheme:dark){path{fill:#fff}}</style>")
    favicon = favicon.replace(f' fill="{AZUL}"', "")
    (PUBLICO / "favicon.svg").write_text(favicon, encoding="utf-8")

    def render(svg, tamanho, fundo=None, margem=0.0):
        """Desenha o SVG num quadrado de 'tamanho' px, centralizado, com margem (área de segurança)."""
        src = pymupdf.open(stream=svg.encode(), filetype="svg")
        pdf = pymupdf.open("pdf", src.convert_to_pdf())
        pag = pymupdf.open()
        p = pag.new_page(width=tamanho, height=tamanho)
        if fundo:
            p.draw_rect(p.rect, color=None, fill=tuple(int(fundo[i:i + 2], 16) / 255 for i in (1, 3, 5)))
        m = tamanho * margem
        p.show_pdf_page(pymupdf.Rect(m, m, tamanho - m, tamanho - m), pdf, 0, keep_proportion=True)
        pix = p.get_pixmap(alpha=fundo is None)
        return Image.open(io.BytesIO(pix.tobytes("png")))

    # apple-touch-icon: símbolo branco sobre azul (combinação permitida), com área de segurança
    render(svg_simples([simbolo], caixa_simbolo, BRANCO, ""), 180, fundo=AZUL, margem=0.18).convert("RGB") \
        .save(PUBLICO / "apple-touch-icon.png")
    # favicon.ico (navegadores antigos): símbolo azul, fundo transparente
    icone = render(svg_simples([simbolo], caixa_simbolo, AZUL, ""), 256, margem=0.04)
    icone.save(PUBLICO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # 5. Imagem de compartilhamento (WhatsApp/redes): o logo branco sobre azul, quadrado
    shutil.copyfile(ORIGEM / "5.jpg", PUBLICO / "compartilhar.jpg")

    for f in sorted(MARCA.iterdir()):
        print(f"  {f.relative_to(BASE).as_posix():55s} {f.stat().st_size // 1024:>4} KB")
    for f in ("favicon.svg", "favicon.ico", "apple-touch-icon.png", "compartilhar.jpg"):
        print(f"  site/public/{f:43s} {(PUBLICO / f).stat().st_size // 1024:>4} KB")
    print(f"  {ARTE_TS.relative_to(BASE).as_posix()}")


if __name__ == "__main__":
    main()
