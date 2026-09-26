"""
Organiza as páginas extraídas para navegação local (etapa 2).

O que faz (sem alterar o texto das páginas):
  1. Renomeia cada página pelo título (sem acentos, com hífens) e a coloca
     em pastas que seguem a árvore do menu. Ex.: paginas/doutrinas/principios-de-fe.md
  2. Troca os links para smir14.com.br pelo caminho do arquivo local.
     Links para páginas que não foram extraídas continuam apontando para o site
     e são listados no relatório como "página não encontrada".
  3. Cria extracao/INDICE.md (menu clicável).
  4. Atualiza materiais.csv e relatorio.md com os novos caminhos.

Como rodar (depois do extrair_site.py):
  python organizar_paginas.py
"""

import csv
import json
import os
import re
import sys
import unicodedata
import urllib.parse as up
from pathlib import Path

from extrair_site import SITE as SITE_BASE, SAIDA, PAGINAS, normalizar, interna, caminho_legivel, tipo_material

PASTA_FORA = "fora-do-menu"
PASTA_COMP = "_compartilhado"
MARCA_RELATORIO = "## Links internos para páginas não encontradas"

# Link para o próprio site dentro do Markdown: ](https://www.smir14.com.br/...) ou <https://...>
RE_ALVO = re.compile(r"\]\((https?://(?:www\.)?smir14\.com\.br[^)\s]*)")
RE_AUTOLINK = re.compile(r"<(https?://(?:www\.)?smir14\.com\.br[^>\s]*)>")
RE_RELATIVO = re.compile(r"\]\((?!https?:|mailto:|#)([^)\s]+\.md)(#[^)\s]*)?\)")


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return t or "sem-titulo"


def ler_pagina(arq):
    """Separa o cabeçalho (entre ---) do texto."""
    bruto = arq.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n", bruto, re.S)
    if not m:
        return {}, "", bruto
    meta = {}
    for linha in m.group(1).splitlines():
        mm = re.match(r'(\w+):\s*"?(.*?)"?\s*$', linha)
        if mm and not linha.startswith(" "):
            meta[mm.group(1)] = mm.group(2).replace('\\"', '"')
    return meta, m.group(0), bruto[m.end():]


def rel(destino, origem_dir):
    return Path(os.path.relpath(destino, origem_dir)).as_posix()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    menu = json.loads((SAIDA / "menu.json").read_text(encoding="utf-8"))

    # ---------- 1. Ler o que existe hoje ----------
    paginas = {}        # url -> {"meta", "cab", "texto", "antigo"}
    compartilhados = []  # arquivos de _compartilhado
    for arq in sorted(PAGINAS.rglob("*.md")):
        if PASTA_COMP in arq.relative_to(PAGINAS).parts:
            compartilhados.append(arq)
            continue
        meta, cab, texto = ler_pagina(arq)
        url = meta.get("url_original")
        if url:
            paginas[normalizar(url)] = {"meta": meta, "cab": cab, "texto": texto, "antigo": arq}
    arquivo_antigo_para_url = {p["antigo"].resolve(): u for u, p in paginas.items()}
    print(f"{len(paginas)} páginas lidas")

    # ---------- 2. Decidir o novo nome de cada página ----------
    novo = {}           # url -> Path novo
    usados = set()

    def reservar(url, pasta, nome):
        destino = pasta / f"{nome}.md"
        if destino in usados:  # dois títulos iguais: acrescenta o fim do endereço
            fim = slug(caminho_legivel(url).strip("/").replace("/", "-")) or "pagina"
            destino = pasta / f"{nome}--{fim}.md"
        usados.add(destino)
        novo[url] = destino

    def pelo_menu(itens, pasta):
        for it in itens:
            u = it["url"]
            nome = slug(it["titulo"])
            if u in paginas and u not in novo:
                reservar(u, pasta, nome)
            pelo_menu(it.get("filhos", []), pasta / nome)
    pelo_menu(menu, PAGINAS)

    # Páginas 2, 3... de uma galeria de fotos ficam junto da página da galeria
    for u in sorted(paginas):
        m = re.match(r"(.*/)photogallerycbm_\d+/(\d+)/$", u)
        if u not in novo and m and m.group(1) in novo:
            pai = novo[m.group(1)]
            reservar(u, pai.parent / pai.stem, f"{pai.stem}-fotos-pagina-{int(m.group(2)) // 10 + 1}")

    for u in sorted(paginas):
        if u in novo:
            continue
        partes = [slug(s) for s in caminho_legivel(u).strip("/").split("/")[:-1]]
        titulo = paginas[u]["meta"].get("titulo") or caminho_legivel(u).strip("/").split("/")[-1]
        reservar(u, PAGINAS.joinpath(PASTA_FORA, *partes), slug(titulo))

    def achar_pagina(link):
        """URL da página extraída para este link, aceitando pequenas variações do
        mesmo endereço (sem a barra final, ou com ?mobileVersion=0 do Webnode)."""
        n = normalizar(link)
        p = up.urlsplit(n)
        consulta = "&".join(q for q in p.query.split("&") if q and not q.lower().startswith("mobileversion"))
        candidatos = [n, up.urlunsplit(p._replace(query=consulta))]
        candidatos += [c.split("?")[0].rstrip("/") + "/" + ("?" + c.split("?", 1)[1] if "?" in c else "")
                       for c in candidatos]
        return next((c for c in candidatos if c in novo), None)

    def destino_provavel(link):
        """Para links relativos quebrados (ex.: /publicações/doutrinas/principios-de-fe/),
        tira pedaços do começo do endereço até achar uma página extraída."""
        partes = [x for x in up.urlsplit(normalizar(link)).path.split("/") if x]
        for i in range(1, len(partes)):
            u = achar_pagina(SITE_BASE + "/" + "/".join(partes[i:]) + "/")
            if u:
                return u
        return None

    # ---------- 3. Reescrever links ----------
    nao_encontradas = []   # (arquivo onde está, link)

    def trocar(texto, arq_novo, arq_antigo):
        pasta = arq_novo.parent

        def alvo_local(link):
            n = achar_pagina(link.split("#")[0])
            frag = "#" + link.split("#", 1)[1] if "#" in link else ""
            if n:
                return rel(novo[n], pasta) + frag
            return None

        def registrar(link):
            if not tipo_material(link):  # arquivos (imagens, pdf) não são páginas
                nao_encontradas.append((arq_novo, link))

        # links relativos de uma execução anterior: voltam a ser endereços do site
        if arq_antigo is not None:
            def voltar(m):
                destino = (arq_antigo.parent / up.unquote(m.group(1))).resolve()
                u = arquivo_antigo_para_url.get(destino)
                return f"]({u}{m.group(2) or ''})" if u else m.group(0)
            texto = RE_RELATIVO.sub(voltar, texto)

        def sub_alvo(m):
            local = alvo_local(m.group(1))
            if local is None:
                registrar(m.group(1))
                return m.group(0)
            return "](" + local
        texto = RE_ALVO.sub(sub_alvo, texto)

        def sub_auto(m):
            local = alvo_local(m.group(1))
            if local is None:
                registrar(m.group(1))
                return m.group(0)
            return f"[{m.group(1)}]({local})"
        return RE_AUTOLINK.sub(sub_auto, texto)

    # grava em memória antes de apagar os arquivos antigos
    saida = {}
    for u, p in paginas.items():
        saida[novo[u]] = p["cab"] + trocar(p["texto"], novo[u], p["antigo"])
    comp_saida = {}
    for arq in compartilhados:
        destino = PAGINAS / PASTA_COMP / arq.name
        comp_saida[destino] = trocar(arq.read_text(encoding="utf-8"), destino, arq)

    for arq in sorted(PAGINAS.rglob("*"), key=lambda x: len(x.parts), reverse=True):
        arq.unlink() if arq.is_file() else arq.rmdir()
    for destino, conteudo in {**saida, **comp_saida}.items():
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(conteudo, encoding="utf-8")

    def rel_saida(caminho):
        return caminho.relative_to(SAIDA).as_posix()

    # ---------- 4. INDICE.md ----------
    L = ["# Índice do site extraído", "",
         "Clique em uma página para abrir o texto extraído. Ao lado está o endereço no site atual.", "",
         "Veja também: [relatório da extração](relatorio.md) · [lista de materiais](materiais.csv)", "",
         "## Menu do site", ""]

    def url_legivel(u):
        return f"[{up.unquote(u).replace('https://www.', '')}]({u})"

    def arvore(itens, nivel):
        for it in itens:
            u = it["url"]
            if u in novo:
                L.append("  " * nivel + f"- [{it['titulo']}]({rel_saida(novo[u])}) — {url_legivel(u)}")
            else:
                L.append("  " * nivel + f"- {it['titulo']} *(página não extraída)* — {url_legivel(u)}")
            arvore(it.get("filhos", []), nivel + 1)
    arvore(menu, 0)

    no_menu = set()

    def coletar(itens):
        for it in itens:
            no_menu.add(it["url"])
            coletar(it.get("filhos", []))
    coletar(menu)
    fora = sorted((u for u in paginas if u not in no_menu), key=lambda u: novo[u].as_posix())
    L += ["", "## Páginas que não aparecem no menu", "",
          "Existem no site, mas só são achadas pelo sitemap ou por links de outras páginas.", ""]
    for u in fora:
        L.append(f"- [{paginas[u]['meta'].get('titulo', u)}]({rel_saida(novo[u])}) — {url_legivel(u)}")
    L += ["", "## Partes que se repetem em todas as páginas", ""]
    for destino in sorted(comp_saida):
        L.append(f"- [{destino.stem.replace('-', ' ').capitalize()}]({rel_saida(destino)})")
    L.append("")
    (SAIDA / "INDICE.md").write_text("\n".join(L), encoding="utf-8")

    # ---------- 5. materiais.csv ----------
    arq_csv = SAIDA / "materiais.csv"
    with open(arq_csv, encoding="utf-8-sig", newline="") as f:
        linhas = list(csv.DictReader(f, delimiter=";"))
    por_caminho = {caminho_legivel(u): novo[u] for u in paginas}
    comp_por_tipo = {d.stem: d for d in comp_saida}
    for ln in linhas:
        pg = ln["pagina"]
        destino = por_caminho.get(pg)
        if destino is None:
            m = re.match(r"\(([\w-]+) —", pg)
            destino = comp_por_tipo.get(m.group(1)) if m else None
        ln["arquivo_pagina"] = rel_saida(destino) if destino else ""
    campos = list(linhas[0].keys()) if linhas else []
    if "arquivo_pagina" in campos:  # coloca a coluna nova logo depois de "pagina"
        campos.remove("arquivo_pagina")
        campos.insert(campos.index("pagina") + 1, "arquivo_pagina")
    with open(arq_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, delimiter=";")
        w.writeheader()
        w.writerows(linhas)

    # ---------- 6. relatorio.md ----------
    arq_rel = SAIDA / "relatorio.md"
    rel_txt = arq_rel.read_text(encoding="utf-8").split("\n" + MARCA_RELATORIO)[0].rstrip() + "\n"
    antigos = {}
    for u, p in paginas.items():
        antigos[p["antigo"].relative_to(SAIDA).as_posix()] = rel_saida(novo[u])

    def sub_caminho(m):
        caminho = m.group(1)
        if caminho in antigos:
            return f"→ [{antigos[caminho]}]({antigos[caminho]})"
        return m.group(0)
    rel_txt = re.sub(r"→ (?:`|\[)(paginas/[^`\]]+\.md)(?:`|\]\([^)]*\))", sub_caminho, rel_txt)
    rel_txt = rel_txt.replace("`paginas/_compartilhado/`", f"`paginas/{PASTA_COMP}/`")
    R = ["", MARCA_RELATORIO, "",
         "Links dentro das páginas que apontam para smir14.com.br, mas para uma página que não foi "
         "extraída (não existe mais, é um link antigo, ou é uma foto da galeria). "
         "Eles foram mantidos apontando para o site original.", ""]
    if nao_encontradas:
        R += ["| Página onde aparece | Link | Motivo provável |", "|---|---|---|"]
        vistos = set()
        for arq, link in sorted(nao_encontradas, key=lambda x: (x[0].as_posix(), x[1])):
            chave = (arq, link.split("#")[0])
            if chave in vistos:
                continue
            vistos.add(chave)
            c = caminho_legivel(link)
            provavel = destino_provavel(link)
            motivo = ("página não encontrada — link de um site antigo (index.php)" if c.startswith("/index.php") else
                      "página não encontrada — foto individual da galeria (as fotos estão em materiais.csv)"
                      if c.startswith("/album/") else
                      "página não encontrada — recurso automático do Webnode (RSS)" if c.startswith("/rss") else
                      f"página não encontrada — link quebrado no site atual; destino provável: "
                      f"[{rel_saida(novo[provavel])}]({rel_saida(novo[provavel])})" if provavel else
                      "página não encontrada — link quebrado no site atual" if "/archive/" in c else
                      "página não encontrada")
            R.append(f"| [{rel_saida(arq)}]({rel_saida(arq)}) | {link} | {motivo} |")
    else:
        R.append("Nenhum.")
    R += ["", "Navegação local: comece por [INDICE.md](INDICE.md).", ""]
    arq_rel.write_text(rel_txt + "\n".join(R), encoding="utf-8")

    print(f"Pronto: {len(novo)} páginas reorganizadas, "
          f"{len({(a, l.split('#')[0]) for a, l in nao_encontradas})} links para páginas não encontradas.")


if __name__ == "__main__":
    main()
