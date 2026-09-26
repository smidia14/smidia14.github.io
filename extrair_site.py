"""
Extrai a estrutura e os textos do site atual (Webnode) da igreja.

O que faz:
  1. Lê o sitemap.xml e percorre o site seguindo só links internos.
  2. Salva cada página como Markdown em extracao/paginas/ (pastas = caminho da URL).
  3. Registra PDFs, links do Drive, Calaméo, YouTube, imagens etc. em
     extracao/materiais.csv (sem baixar nada).
  4. Reconstrói o menu em extracao/menu.json.
  5. Gera extracao/relatorio.md.

Como rodar:
  python extrair_site.py            (baixa o site; respeita o robots.txt)
  python extrair_site.py --offline  (reaproveita o HTML já baixado em cache_html/)
"""

import argparse
import csv
import hashlib
import html as html_lib
import json
import re
import sys
import time
import urllib.parse as up
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Comment
from markdownify import markdownify

SITE = "https://www.smir14.com.br"
DOMINIOS = {"smir14.com.br", "www.smir14.com.br"}
AGENTE = "Mozilla/5.0 (extracao do site da igreja para migracao)"

BASE = Path(__file__).resolve().parent
SAIDA = BASE / "extracao"
PAGINAS = SAIDA / "paginas"
CACHE = BASE / "cache_html"

# Caminhos internos que são automáticos do Webnode (não são páginas da igreja)
IGNORAR_CAMINHOS = ("/servers/", "/sitemap/", "/rss", "/search/", "/_system/",
                    "/index.php",  # links antigos (de um site anterior) colados em textos
                    "/album/",     # cada foto da galeria vira uma "página"; as fotos vão para materiais.csv
                    "/images/", "/_files/")

EXT_IMAGEM = (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tif", ".tiff")
EXT_ARQUIVO = (".doc", ".docx", ".ppt", ".pptx", ".pps", ".ppsx", ".xls", ".xlsx",
               ".zip", ".rar", ".7z", ".mp3", ".mp4", ".wav", ".wma", ".m4a", ".avi",
               ".wmv", ".epub", ".mobi", ".txt", ".rtf", ".odt")
HOSPEDAGEM_ARQUIVO = ("dropbox.com", "onedrive.live.com", "1drv.ms", "mega.nz",
                      "4shared.com", "scribd.com", "mediafire.com", "sway.office.com")
REVISTA = ("calameo.com", "issuu.com", "yumpu.com", "flipsnack.com", "joomag.com")


# --------------------------------------------------------------------------
# URLs
# --------------------------------------------------------------------------

def normalizar(url):
    """Deixa a URL num formato único (https, www, sem #, /home/ = /)."""
    p = up.urlsplit(url)
    host = p.netloc.lower()
    if host in DOMINIOS:
        host = "www.smir14.com.br"
    caminho = up.quote(up.unquote(p.path or "/"), safe="/-_.~!$&'()*+,;=:@")
    if caminho in ("", "/home/", "/home"):
        caminho = "/"
    return up.urlunsplit(("https", host, caminho, p.query, ""))


def interna(url):
    return up.urlsplit(url).netloc.lower() in DOMINIOS


def caminho_legivel(url):
    return up.unquote(up.urlsplit(url).path)


def arquivo_da_pagina(url):
    """/publicações/livros/ -> paginas/publicações/livros/index.md"""
    p = up.urlsplit(url)
    partes = [re.sub(r'[<>:"\\|?*]', "_", s) for s in up.unquote(p.path).split("/") if s]
    nome = "index"
    if p.query:
        nome += "__" + re.sub(r"[^\w-]+", "_", up.unquote(p.query))
    return PAGINAS.joinpath(*partes, nome + ".md")


# --------------------------------------------------------------------------
# Download (com pausa e cache)
# --------------------------------------------------------------------------

class Baixador:
    def __init__(self, atraso, offline):
        self.atraso = atraso
        self.offline = offline
        self.sessao = requests.Session()
        self.sessao.headers["User-Agent"] = AGENTE
        self.ultimo = 0.0
        CACHE.mkdir(exist_ok=True)

    def _cache(self, url):
        return CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")

    def baixar(self, url):
        """Devolve (status_http, url_final, html) ou lança erro."""
        arq = self._cache(url)
        meta = arq.with_suffix(".json")
        if arq.exists() and meta.exists():
            info = json.loads(meta.read_text(encoding="utf-8"))
            return info["status"], info["final"], arq.read_text(encoding="utf-8")
        if self.offline:
            raise RuntimeError("não está no cache (modo --offline)")
        espera = self.atraso - (time.time() - self.ultimo)
        if espera > 0:
            time.sleep(espera)
        try:
            r = self.sessao.get(url, timeout=30, allow_redirects=True)
        except requests.ConnectionError:
            time.sleep(self.atraso * 2)  # o servidor derrubou a conexão: tenta mais uma vez
            r = self.sessao.get(url, timeout=30, allow_redirects=True)
        self.ultimo = time.time()
        r.encoding = r.encoding if r.encoding and r.encoding.lower() != "iso-8859-1" else "utf-8"
        html = r.text
        if r.status_code == 200 and "html" in r.headers.get("Content-Type", ""):
            arq.write_text(html, encoding="utf-8")
            meta.write_text(json.dumps({"status": r.status_code, "final": r.url}), encoding="utf-8")
        return r.status_code, r.url, html


def ler_robots(baixador):
    try:
        r = baixador.sessao.get(SITE + "/robots.txt", timeout=30)
        m = re.search(r"crawl-delay:\s*(\d+)", r.text, re.I)
        return int(m.group(1)) if m else None
    except requests.RequestException:
        return None


def ler_sitemap(baixador):
    copia = CACHE / "sitemap.xml"
    try:
        if baixador.offline:
            dados = copia.read_bytes()
        else:
            dados = baixador.sessao.get(SITE + "/sitemap.xml", timeout=30).content
            copia.write_bytes(dados)
        raiz = ET.fromstring(dados)
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        return [loc.text.strip() for loc in raiz.findall(".//s:loc", ns)]
    except Exception as e:  # noqa: BLE001
        print("  (aviso) não consegui ler o sitemap:", e)
        return []


# --------------------------------------------------------------------------
# Classificação de links
# --------------------------------------------------------------------------

def tipo_material(url, eh_img=False):
    """Devolve o tipo do material, ou None se for um link comum."""
    p = up.urlsplit(url)
    host = p.netloc.lower()
    caminho = up.unquote(p.path).lower()
    if eh_img:
        return "imagem"
    if "youtube.com" in host or "youtu.be" in host:
        return "YouTube"
    if any(h in host for h in REVISTA):
        return "revista eletrônica/Calaméo"
    if "drive.google.com" in host or "docs.google.com" in host:
        return "Google Drive"
    if caminho.endswith(".pdf"):
        return "PDF"
    if caminho.endswith(EXT_IMAGEM):
        return "imagem"
    if caminho.endswith(EXT_ARQUIVO) or any(h in host for h in HOSPEDAGEM_ARQUIVO):
        return "outro"
    if "cdnwnd.com" in host or "/_files/" in caminho:  # arquivo hospedado no Webnode
        return "outro"
    return None


def eh_webnode(url):
    return "webnode." in up.urlsplit(url).netloc.lower()


def nome_de_arquivo(url):
    base = up.unquote(up.urlsplit(url).path.rstrip("/").split("/")[-1])
    return re.sub(r"\.[a-z0-9]{2,4}$", "", base, flags=re.I) or url


def texto_limpo(t):
    return re.sub(r"\s+", " ", (t or "").replace("\xa0", " ")).strip()


def contexto(el, limite):
    """Texto que aparece logo antes do elemento, dentro do mesmo bloco da página
    (ajuda a identificar a capa: "Julho - Dezembro 2º semestre 2020")."""
    partes = []
    for anterior in el.find_all_previous(string=True):
        if not any(p is limite for p in anterior.parents):
            break
        if isinstance(anterior, Comment):
            continue
        t = texto_limpo(anterior)
        if t:
            partes.insert(0, t)
        if len(" ".join(partes)) > 80:
            break
    txt = " ".join(partes)
    if len(txt) > 80:  # corta no início de uma palavra
        txt = txt[-80:].split(" ", 1)[-1]
    return txt


GENERICOS = {"baixar", "baixe", "baixe em", "baixar em", "baixe aqui", "aqui", "clique aqui",
             "open", "ppt", "pdf", "download", "link", "veja", "leia", "acesse", "boletim"}


def nome_fraco(nome):
    n = nome.lower().strip(" .:!")
    return len(n) <= 2 or n in GENERICOS or not re.search(r"[a-zà-ú]{3}", n)


def rotulo_anterior(el, limite):
    """As 1-2 últimas frases antes do elemento (ignorando "Baixe em", "BAIXAR"...)."""
    partes = []
    for anterior in el.find_all_previous(string=True):
        if not any(p is limite for p in anterior.parents):
            break
        t = texto_limpo(anterior)
        if isinstance(anterior, Comment) or not t or nome_fraco(t):
            continue
        partes.insert(0, t)
        if len(partes) == 2 or len(" ".join(partes)) > 40:
            break
    return " ".join(partes)


def escolher_nome(texto_link, capa, link, rotulo):
    """Nome do material: o texto do link; se for genérico ("BAIXAR", "open"...),
    usa o texto que aparece logo antes na página + o nome do arquivo da capa."""
    if texto_link and not nome_fraco(texto_link):
        return texto_link
    arquivo = nome_de_arquivo(capa) if capa else ""
    arquivo = "" if nome_fraco(arquivo) else arquivo
    if rotulo:
        return rotulo + (f" ({arquivo})" if arquivo else "")
    return arquivo or texto_link or nome_de_arquivo(link)


# --------------------------------------------------------------------------
# Página
# --------------------------------------------------------------------------

def absolutizar(bloco, base):
    """Troca links relativos (ex.: "departamento/evangelismo/") pelo endereço completo."""
    for tag, attr in (("a", "href"), ("img", "src"), ("iframe", "src"), ("embed", "src")):
        for t in bloco.find_all(tag):
            v = (t.get(attr) or "").strip()
            if v and not v.startswith(("mailto:", "tel:", "javascript:", "#", "data:")):
                # espaços e parênteses quebram links em Markdown: viram %20, %28, %29
                t[attr] = up.quote(up.urljoin(base, v), safe=":/?&=#%~+,;@!$*'-._")


def limpar_bloco(bloco):
    """Remove scripts, itens escondidos e rastros do Webnode de um trecho HTML."""
    for t in bloco.find_all(["script", "style", "noscript"]):
        t.decompose()
    for c in bloco.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
    for t in bloco.find_all(style=re.compile(r"display:\s*none", re.I)):
        if not texto_limpo(t.get_text()) and not t.find(["img", "a", "iframe"]):
            t.decompose()
    for a in bloco.find_all("a", href=True):
        if eh_webnode(a["href"]):
            a.decompose()
    busca = bloco.find(id="fulltextSearch")          # caixa de pesquisa do Webnode
    if busca:
        (busca.find_parent(class_="box") or busca).decompose()
    nav = bloco.find(id="pageNavigator")
    if nav:
        nav.decompose()
    for t in bloco.find_all(class_="cleaner"):
        t.decompose()


def para_markdown(bloco):
    """Converte o HTML para Markdown sem resumir o texto."""
    b = BeautifulSoup(str(bloco), "lxml")
    # Vídeos/documentos incorporados viram uma linha de texto com o link
    for f in b.find_all(["iframe", "embed", "object"]):
        src = f.get("src") or f.get("data") or ""
        f.replace_with(b.new_string(f"\n\n[Conteúdo incorporado: {src}]\n\n"))
    for form in b.find_all("form"):
        campos = [texto_limpo(x.get_text()) for x in form.find_all("label")]
        campos = [c for c in campos if c]
        desc = "[Formulário do site" + (": " + ", ".join(campos) if campos else "") + "]"
        form.replace_with(b.new_string(f"\n\n{desc}\n\n"))
    # Espaço "rígido" (&nbsp;) vira espaço comum antes da conversão; senão, o espaço no
    # fim de um itálico/negrito se perde e a palavra seguinte gruda.
    for t in b.find_all(string=True):
        if " " in t:
            t.replace_with(t.replace(" ", " "))
    # Negrito/itálico sem texto nenhum (só espaços) é removido, mantendo o espaço
    for t in b.find_all(["strong", "b", "em", "i", "u"]):
        if not t.get_text().strip() and not t.find(["img", "a", "br", "iframe"]):
            t.replace_with(b.new_string(" " if t.get_text() else ""))
    md = markdownify(str(b), heading_style="ATX", bullets="-", strip=["span", "font", "u"],
                     keep_inline_images_in=["h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "li",
                                            "a", "strong", "b", "em", "i", "span", "u", "font"])
    md = md.replace("\xa0", " ")
    md = re.sub(r"[ \t]{2,}(?=\S)", " ", md)          # espaços usados como "layout"
    md = re.sub(r"^[ \t]+$", "", md, flags=re.M)
    md = re.sub(r"^#+\s*$", "", md, flags=re.M)        # títulos vazios
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"


def extrair_menu(soup, base_url):
    """Lê o <ul class="menu"> e devolve a árvore na ordem do site."""
    def ler_ul(ul):
        itens = []
        for li in ul.find_all("li", recursive=False):
            a = li.find("a", recursive=False)
            if not a:
                continue
            url = normalizar(up.urljoin(base_url, a.get("href", "")))
            item = {"titulo": texto_limpo(a.get_text()), "url": url,
                    "caminho": caminho_legivel(url), "filhos": []}
            sub = li.find("ul", recursive=False)
            if sub:
                item["filhos"] = ler_ul(sub)
            itens.append(item)
        return itens
    ul = soup.select_one("ul.menu")
    return ler_ul(ul) if ul else []


def migalhas(soup):
    nav = soup.select_one("#navizone")
    if not nav:
        return []
    itens = [texto_limpo(a.get_text()) for a in nav.find_all("a")]
    atual = nav.select_one("#navCurrentPage")
    if atual:
        itens.append(texto_limpo(atual.get_text()))
    return itens


def titulo_da_pagina(soup):
    atual = soup.select_one("#navCurrentPage")
    if atual and texto_limpo(atual.get_text()):
        return html_lib.unescape(texto_limpo(atual.get_text()))
    t = html_lib.unescape(texto_limpo(soup.title.get_text())) if soup.title else ""
    return t.split("::")[0].strip() or "(sem título)"


# --------------------------------------------------------------------------
# Principal
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="usar só o HTML já baixado")
    ap.add_argument("--atraso", type=float, default=None, help="segundos entre requisições")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    baixador = Baixador(atraso=2.0, offline=args.offline)
    fila = [normalizar(SITE + "/")]
    no_sitemap = set()
    if not args.offline:
        pedido = ler_robots(baixador)
        baixador.atraso = args.atraso if args.atraso is not None else max(2.0, pedido or 0)
        print(f"Pausa entre páginas: {baixador.atraso:.0f} s (robots.txt pede {pedido} s)")
    for u in ler_sitemap(baixador):
        n = normalizar(u)
        if interna(n):
            no_sitemap.add(n)
            if n not in fila:
                fila.append(n)
    print(f"Sitemap: {len(no_sitemap)} endereços")

    vistas = set()
    paginas = {}            # url -> dados da página
    erros = []              # (url, motivo, onde foi encontrada)
    achada_em = defaultdict(set)
    materiais = {}          # (link, pagina) -> linha do csv
    externos = defaultdict(set)
    compartilhados = {}     # hash -> {"tipo", "md", "paginas"}
    menu = []
    rodape = ""

    def registrar_material(link, pagina, tipo, nome, ctx, capa=""):
        chave = (link, pagina)
        if chave not in materiais:
            materiais[chave] = {"nome": nome, "pagina": pagina, "link": link, "tipo": tipo,
                                "status": "PENDENTE", "contexto": ctx, "imagem_capa": capa}

    def registrar_links(bloco, url_pagina, rotulo_pagina):
        """Registra materiais e links externos de um trecho da página."""
        for a in bloco.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith(("mailto:", "tel:", "javascript:", "#")) or not href:
                continue
            link = up.urljoin(url_pagina, href)
            if eh_webnode(link):
                continue
            tipo = tipo_material(link)
            img = a.find("img")
            capa = img.get("src", "") if img else ""
            if tipo:
                ctx = contexto(a, bloco)
                texto = texto_limpo(a.get_text()) or (texto_limpo(img.get("alt")) if img else "")
                nome = escolher_nome(texto, capa, link, rotulo_anterior(a, bloco))
                if not texto and not img:
                    nome = "(link sem texto visível no site) " + nome
                registrar_material(link, rotulo_pagina, tipo, nome, ctx, capa)
            elif not interna(link):
                externos[link].add(rotulo_pagina)
        for img in bloco.find_all("img", src=True):
            src = up.urljoin(url_pagina, img["src"].strip())
            nome = texto_limpo(img.get("alt")) or nome_de_arquivo(src)
            registrar_material(src, rotulo_pagina, "imagem", nome, contexto(img, bloco))
        for f in bloco.find_all(["iframe", "embed", "object"]):
            src = (f.get("src") or f.get("data") or "").strip()
            if not src:
                continue
            src = up.urljoin(url_pagina, src)
            tipo = tipo_material(src) or "outro"
            registrar_material(src, rotulo_pagina, tipo, "Conteúdo incorporado (" + tipo + ")",
                               contexto(f, bloco))

    def guardar_compartilhado(tipo, bloco, url):
        md = para_markdown(bloco)
        if not texto_limpo(re.sub(r"[!\[\]()#*]", "", md)) and "![" not in md:
            return
        h = hashlib.sha1(md.encode()).hexdigest()[:8]
        if h not in compartilhados:
            compartilhados[h] = {"tipo": tipo, "md": md, "paginas": [], "bloco": str(bloco)}
        compartilhados[h]["paginas"].append(url)

    while fila:
        url = fila.pop(0)
        if url in vistas:
            continue
        vistas.add(url)
        print(f"[{len(vistas):3d}] {caminho_legivel(url)}")
        try:
            status, final, html = baixador.baixar(url)
        except Exception as e:  # noqa: BLE001
            erros.append((url, f"falha de conexão: {e}", sorted(achada_em[url])))
            continue
        if status != 200:
            erros.append((url, f"HTTP {status}", sorted(achada_em[url])))
            continue
        final_n = normalizar(final)
        if final_n != url:
            if not interna(final_n):
                erros.append((url, f"redireciona para fora do site: {final}", sorted(achada_em[url])))
                continue
            if final_n in vistas:
                continue
            vistas.add(final_n)
            url = final_n

        soup = BeautifulSoup(html, "lxml")
        if not menu:
            menu = extrair_menu(soup, url)
        if not rodape:
            r = soup.select_one("#rbcFooterText")
            rodape = texto_limpo(r.get_text()) if r else ""

        # Links relativos: no conteúdo valem a partir da página; nas colunas laterais
        # (iguais em todo o site) valem a partir da página inicial.
        for seletor, base in (("#content", url), ("#sidebarContent", SITE + "/"),
                              ("#leftSideContent", SITE + "/"), ("#menuzone", SITE + "/")):
            if soup.select_one(seletor):
                absolutizar(soup.select_one(seletor), base)

        # Descobre novas páginas: só no menu, no conteúdo e nas colunas laterais
        # (o rodapé automático do Webnode tem links relativos que geram endereços falsos)
        areas = [soup.select_one(s) for s in ("#menuzone", "#content", "#sidebarContent", "#leftSideContent")]
        for a in [a for area in areas if area for a in area.find_all("a", href=True)]:
            href = a["href"].strip()
            if href.startswith(("mailto:", "tel:", "javascript:", "#")):
                continue
            link = normalizar(up.urljoin(url, href))
            if not interna(link):
                continue
            if any(caminho_legivel(link).startswith(c) for c in IGNORAR_CAMINHOS):
                continue
            if "print" in up.urlsplit(link).query.lower():
                continue
            if tipo_material(link):  # arquivo (imagem, pdf...), não é página
                continue
            achada_em[link].add(caminho_legivel(url))
            if link not in vistas and link not in fila:
                fila.append(link)

        conteudo = soup.select_one("#content")
        if conteudo is None:
            erros.append((url, "página sem bloco de conteúdo (#content)", sorted(achada_em[url])))
            continue
        trilha = migalhas(soup)
        limpar_bloco(conteudo)
        rotulo = caminho_legivel(url)
        registrar_links(conteudo, url, rotulo)

        for seletor, tipo in (("#sidebarContent", "barra-lateral"), ("#leftSideContent", "coluna-esquerda")):
            bloco = soup.select_one(seletor)
            if bloco:
                limpar_bloco(bloco)
                guardar_compartilhado(tipo, bloco, rotulo)

        paginas[url] = {
            "url": url,
            "titulo": titulo_da_pagina(soup),
            "trilha": trilha,
            "md": para_markdown(conteudo),
            "no_sitemap": url in no_sitemap,
        }

    # ---------------- Pais no menu ----------------
    pai_menu, posicao_menu = {}, {}

    def percorrer(itens, pai, prefixo):
        for i, it in enumerate(itens, 1):
            pos = f"{prefixo}{i}"
            pai_menu.setdefault(it["url"], pai)
            posicao_menu.setdefault(it["url"], pos)
            percorrer(it["filhos"], it, pos + ".")
    percorrer(menu, None, "")

    # ---------------- Gravação ----------------
    if PAGINAS.exists():
        for f in sorted(PAGINAS.rglob("*"), reverse=True):
            f.unlink() if f.is_file() else f.rmdir()
    PAGINAS.mkdir(parents=True, exist_ok=True)

    def aspas(t):
        return '"' + str(t).replace("\\", "\\\\").replace('"', '\\"') + '"'

    for url, p in paginas.items():
        if url in pai_menu:
            pai = pai_menu[url]
            pai_txt = f"{pai['titulo']} ({pai['caminho']})" if pai else "(item principal do menu)"
            no_menu = "sim"
        else:
            no_menu = "não"
            pai_txt = "(fora do menu)"
            if len(p["trilha"]) >= 2:
                pai_txt += f" — pelo caminho de navegação: {p['trilha'][-2]}"
        arq = arquivo_da_pagina(url)
        arq.parent.mkdir(parents=True, exist_ok=True)
        cab = [
            "---",
            f"titulo: {aspas(p['titulo'])}",
            f"url_original: {aspas(url)}",
            f"endereco: {aspas(caminho_legivel(url))}",
            f"pai_no_menu: {aspas(pai_txt)}",
            f"esta_no_menu: {no_menu}",
        ]
        if url in posicao_menu:
            cab.append(f"posicao_no_menu: {aspas(posicao_menu[url])}")
        if p["trilha"]:
            cab.append(f"caminho_de_navegacao: {aspas(' > '.join(p['trilha']))}")
        cab += ["---", "", ""]
        arq.write_text("\n".join(cab) + p["md"], encoding="utf-8")
        p["arquivo"] = arq.relative_to(SAIDA).as_posix()

    # Blocos que se repetem em várias páginas (barra lateral, coluna esquerda)
    pasta_comp = PAGINAS / "_compartilhado"
    pasta_comp.mkdir(exist_ok=True)
    contagem = Counter()
    lista_comp = []
    for h, c in sorted(compartilhados.items(), key=lambda kv: -len(kv[1]["paginas"])):
        contagem[c["tipo"]] += 1
        nome = c["tipo"] + ("" if contagem[c["tipo"]] == 1 else f"-{contagem[c['tipo']]}")
        rotulo = f"({nome} — aparece em {len(c['paginas'])} páginas)"
        bloco = BeautifulSoup(c["bloco"], "lxml")
        registrar_links(bloco, SITE + c["paginas"][0], rotulo)
        texto = [
            "---",
            f"titulo: {aspas(nome.replace('-', ' ').capitalize())}",
            'observacao: "Bloco que se repete ao lado do conteúdo em várias páginas do site"',
            "aparece_em:",
            *[f"  - {aspas(pg)}" for pg in c["paginas"]],
            "---", "", c["md"],
        ]
        (pasta_comp / f"{nome}.md").write_text("\n".join(texto), encoding="utf-8")
        lista_comp.append((nome, len(c["paginas"])))
    if rodape:
        (pasta_comp / "rodape.md").write_text(
            '---\ntitulo: "Rodapé"\nobservacao: "Texto do rodapé do site (sem a parte automática do Webnode)"\n---\n\n'
            + rodape + "\n", encoding="utf-8")

    # menu.json
    (SAIDA / "menu.json").write_text(json.dumps(menu, ensure_ascii=False, indent=2), encoding="utf-8")

    # materiais.csv
    campos = ["nome", "pagina", "link", "tipo", "status", "contexto", "imagem_capa"]
    with open(SAIDA / "materiais.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=campos, delimiter=";")
        w.writeheader()
        for m in materiais.values():
            w.writerow(m)

    # ---------------- Relatório ----------------
    L = ["# Relatório da extração do site smir14.com.br", ""]
    L += [f"- **Páginas extraídas:** {len(paginas)}",
          f"- **Materiais registrados:** {len(materiais)} (em `materiais.csv`)",
          f"- **Páginas com erro:** {len(erros)}",
          f"- **Links externos (sites que não são arquivos):** {len(externos)}", ""]

    L += ["## Árvore do menu", "", "Na mesma ordem do menu do site atual.", ""]

    def arvore(itens, nivel):
        for it in itens:
            p = paginas.get(it["url"])
            obs = f" → `{p['arquivo']}`" if p else " ⚠️ *(não extraída)*"
            L.append("  " * nivel + f"- **{it['titulo']}** — `{it['caminho']}`{obs}")
            arvore(it["filhos"], nivel + 1)
    arvore(menu, 0)
    L.append("")

    fora = [p for u, p in paginas.items() if u not in pai_menu]
    L += ["## Páginas que existem mas não aparecem no menu", "",
          "Achadas pelo sitemap ou por links dentro de outras páginas.", ""]
    for p in sorted(fora, key=lambda x: x["url"]):
        L.append(f"- **{p['titulo']}** — `{caminho_legivel(p['url'])}` → `{p['arquivo']}`")
    L.append("")

    L += ["## Materiais por tipo", "", "| Tipo | Quantidade |", "|---|---|"]
    for tipo, n in Counter(m["tipo"] for m in materiais.values()).most_common():
        L.append(f"| {tipo} | {n} |")
    L += [f"| **Total** | **{len(materiais)}** |", ""]
    unicos = len({m["link"] for m in materiais.values()})
    L += [f"Endereços diferentes (sem repetir o mesmo arquivo em páginas diferentes): {unicos}.", ""]

    L += ["## Páginas que deram erro", ""]
    if erros:
        L += ["Quase todos são **links quebrados que já existem no site atual**, e não páginas "
              "faltando: são links escritos de forma relativa (ex.: `departamento/saude/` dentro da "
              "página `/departamento/`), que o navegador completa como `/departamento/departamento/saude/`.", "",
              "| Endereço | Problema | Linkado a partir de | Causa provável |", "|---|---|---|---|"]
        for u, motivo, origem in erros:
            c = caminho_legivel(u)
            partes = [x for x in c.split("/") if x]
            if len(partes) >= 2 and partes[0] == partes[1] or "/archive/news/" in c                     or (origem and c.startswith(origem[0]) and c != origem[0]):
                causa = "link relativo quebrado no site atual"
            else:
                causa = "verificar"
            motivo = "sem resposta do servidor" if "Connection" in motivo else motivo
            L.append(f"| `{c}` | {motivo} | {', '.join(origem[:3]) or 'sitemap'} | {causa} |")
    else:
        L.append("Nenhuma.")
    L.append("")

    L += ["## Links externos encontrados", "",
          "Links para outros sites (os que apontam para arquivos estão em `materiais.csv`).", "",
          "| Link | Onde aparece |", "|---|---|"]
    for link in sorted(externos):
        onde = sorted(externos[link])
        L.append(f"| {link} | {', '.join(onde[:3])}{' …' if len(onde) > 3 else ''} |")
    L.append("")

    L += ["## Blocos repetidos", "",
          "Partes que aparecem ao lado do conteúdo em várias páginas. Foram salvas uma vez só, "
          "em `paginas/_compartilhado/`:", ""]
    for nome, n in lista_comp:
        L.append(f"- `{nome}.md` — aparece em {n} páginas")
    if rodape:
        L.append("- `rodape.md` — texto do rodapé")
    L += ["", "## O que foi removido (é do Webnode, não da igreja)", "",
          "- Faixa \"Você gostou deste site? Crie o seu próprio site gratuito\"",
          "- \"Crie um site gratuito Webnode\" no rodapé",
          "- Links automáticos: Mapa do site, RSS, Imprimir",
          "- Caixa \"Pesquisar no site\" do Webnode", ""]
    (SAIDA / "relatorio.md").write_text("\n".join(L), encoding="utf-8")

    print(f"\nPronto: {len(paginas)} páginas, {len(materiais)} materiais, {len(erros)} erros.")


if __name__ == "__main__":
    main()
