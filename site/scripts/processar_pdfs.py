# Processa os PDFs novos da biblioteca (roda sozinho na publicação; veja .github/workflows/publicar.yml).
#
# Para cada material em src/data/biblioteca/*.json cujo PDF do Drive ainda não foi processado:
#   1. baixa o PDF pelo link do Drive (precisa estar "qualquer pessoa com o link");
#   2. anota o tamanho (MB) e o número de páginas;
#   3. gera a capa (imagem da 1ª página) em public/capas/<id>.webp;
#   4. se passar de 50 MB, gera as prévias das páginas 1 e 2 em public/previas/.
# O resultado vai para src/data/pdfs-processados.json (chave = ID do arquivo no Drive).
# PDFs já processados não são baixados de novo. Se um PDF falhar, o site é publicado assim
# mesmo (com a capa padrão) e o aviso aparece no registro da publicação (aba Actions).
#
# SEGURANÇA (proteção contra alguém que entre no Drive e troque um arquivo):
#   - só aceita arquivo que é PDF de verdade (começa com "%PDF-");
#   - recusa PDF com código embutido (JavaScript), comando para abrir programas (Launch) ou
#     arquivos escondidos dentro dele (anexos) — é assim que um PDF perigoso ataca;
#   - a cada publicação (e uma vez por dia), confere cada arquivo do Drive pedindo só os
#     primeiros bytes: se o tamanho ou a data de alteração mudaram, baixa e confere de novo.
#   Um arquivo recusado fica marcado como "bloqueado" e SOME do site até ser corrigido.
#
# Uso: python scripts/processar_pdfs.py   (dentro da pasta site/)
import io, json, re, sys, tempfile
from pathlib import Path

import requests

# pymupdf e Pillow só são carregados na publicação (main). A conferência rápida (--so-conferir)
# roda no workflow do painel, que só instala o "requests".
pymupdf = Image = None

SITE = Path(__file__).resolve().parent.parent
PASTA_MATERIAIS = SITE / "src/data/biblioteca"
ARQ_PROCESSADOS = SITE / "src/data/pdfs-processados.json"
CAPAS, PREVIAS = SITE / "public/capas", SITE / "public/previas"
LIMITE_PESADO_MB = 50


def id_do_drive(link: str):
    m = re.search(r"/d/([\w-]{10,})", link) or re.search(r"[?&]id=([\w-]{10,})", link)
    return m.group(1) if m else None


PERIGOSOS = (b"/JavaScript", b"/JS", b"/Launch", b"/EmbeddedFile", b"/RichMedia", b"/ImportData", b"/SubmitForm", b"/GoToE")


def conferir_pdf(doc) -> str | None:
    """Procura dentro do PDF as coisas que um PDF perigoso usa. Devolve o motivo, ou None se está limpo."""
    if doc.embfile_count():
        return "tem arquivos escondidos dentro (anexos)"
    for x in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(x, compressed=True).encode("latin-1", "replace")
        except Exception:  # noqa: BLE001
            continue
        for marca in PERIGOSOS:
            # "/JS" não pode pegar nomes comuns como "/JSomething": confere o caractere seguinte
            i = obj.find(marca)
            while i != -1:
                prox = obj[i + len(marca) : i + len(marca) + 1]
                if not prox.isalnum():
                    return f"tem {marca.decode()} (código ou ação escondida)"
                i = obj.find(marca, i + 1)
    return None


def espiar(fid: str):
    """Pede ao Drive só os primeiros bytes: devolve (é PDF?, tamanho exato, data de alteração)."""
    url = "https://drive.usercontent.google.com/download"
    r = requests.get(url, params={"id": fid, "export": "download", "confirm": "t"}, headers={"Range": "bytes=0-15"}, timeout=60)
    r.raise_for_status()
    total = r.headers.get("Content-Range", "").rpartition("/")[2]
    return r.content[:5] == b"%PDF-", int(total) if total.isdigit() else None, r.headers.get("Last-Modified", "")


def baixar(fid: str, destino: Path) -> bool:
    url = "https://drive.usercontent.google.com/download"
    with requests.get(url, params={"id": fid, "export": "download", "confirm": "t"}, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(destino, "wb") as f:
            for parte in r.iter_content(1 << 20):
                f.write(parte)
    return destino.read_bytes()[:5] == b"%PDF-"


def imagem(doc, pagina: int, largura: int, arquivo: Path, qualidade: int):
    p = doc[pagina]
    z = largura / p.rect.width
    pix = p.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    Image.open(io.BytesIO(pix.tobytes("png"))).save(arquivo, "WEBP", quality=qualidade, method=6)


def salvar(dados):
    ARQ_PROCESSADOS.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def aviso(msg: str):
    print(f"::warning::{msg}")  # aparece destacado no registro do GitHub Actions


def main():
    global pymupdf, Image
    import pymupdf
    from PIL import Image

    dados = json.loads(ARQ_PROCESSADOS.read_text(encoding="utf-8"))
    pdfs = dados["pdfs"]
    CAPAS.mkdir(parents=True, exist_ok=True)
    PREVIAS.mkdir(parents=True, exist_ok=True)
    novos = 0
    for arq in sorted(PASTA_MATERIAIS.glob("*.json")):
        e = json.loads(arq.read_text(encoding="utf-8"))
        if e.get("esconder"):
            continue
        fid = id_do_drive(e.get("linkDrive", ""))
        if not fid:
            aviso(f"{arq.name}: o link do Drive não parece válido ({e.get('linkDrive')!r})")
            continue
        atual = pdfs.get(fid, {})
        falta_previa = (atual.get("tamanhoMB") or 0) > LIMITE_PESADO_MB and not atual.get("previas")
        # vigilância: o arquivo no Drive continua o mesmo que foi conferido?
        mudou = trocado = False
        if fid in pdfs:
            try:
                e_pdf, tamanho, alterado = espiar(fid)
                # trocado = alguém mexeu no arquivo depois da última conferência
                trocado = not e_pdf or ("bytes" in atual and (
                    (tamanho is not None and tamanho != atual.get("bytes"))
                    or bool(alterado and alterado != atual.get("alterado"))
                ))
                # conferido antes desta proteção existir: confere o conteúdo uma vez (mantém capa)
                mudou = trocado or "bytes" not in atual
                if mudou:
                    aviso(f"{arq.name}: o arquivo no Drive mudou ou ainda não tinha a conferência completa — conferindo de novo.")
            except Exception as erro:  # noqa: BLE001 — Drive fora do ar: mantém como está
                aviso(f"{arq.name}: não foi possível conferir o arquivo no Drive agora ({erro})")
        if fid in pdfs and atual.get("capa") is not None and not falta_previa and not mudou and not atual.get("bloqueado"):
            continue
        print(f"Processando {arq.name} ({fid})…", flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "material.pdf"
            try:
                if not baixar(fid, pdf):
                    aviso(f"{arq.name}: o Drive não entregou um PDF. Confira se o arquivo é PDF e está compartilhado como 'Qualquer pessoa com o link'.")
                    if fid in pdfs:  # era PDF e deixou de ser: some do site
                        pdfs[fid] = {"bloqueado": "o arquivo no Drive não é mais um PDF"}
                        salvar(dados)
                    continue
                with pymupdf.open(pdf) as doc:  # fechar o PDF antes de apagar o temporário (Windows)
                    perigo = conferir_pdf(doc)
                    if perigo:
                        aviso(f"{arq.name}: PDF BLOQUEADO — {perigo}. Ele não aparece no site. Confira o arquivo no Drive.")
                        pdfs[fid] = {"bloqueado": perigo}
                        salvar(dados)
                        continue
                    mb = round(pdf.stat().st_size / 1e6, 1)
                    _, _, alterado = espiar(fid)
                    info = {"tamanhoMB": mb, "paginas": len(doc), "bytes": pdf.stat().st_size, "alterado": alterado}
                    # mantém capa/prévias que já existiam (materiais antigos), senão gera
                    if trocado or atual.get("bloqueado"):
                        atual = {}  # arquivo novo: capa e prévias novas
                    info["capa"] = atual.get("capa") or f"/capas/{fid}.webp"
                    if not atual.get("capa"):
                        imagem(doc, 0, 480, CAPAS / f"{fid}.webp", 70)
                    if mb > LIMITE_PESADO_MB and len(doc) >= 2:
                        info["previas"] = atual.get("previas") or []
                        if not info["previas"]:
                            for k in (0, 1):
                                imagem(doc, k, 800, PREVIAS / f"{fid}-{k + 1}.webp", 65)
                            info["previas"] = [f"/previas/{fid}-1.webp", f"/previas/{fid}-2.webp"]
                pdfs[fid] = info
                novos += 1
                salvar(dados)  # guarda o progresso a cada PDF
                print(f"  ok: {mb} MB, {info['paginas']} páginas", flush=True)
            except Exception as erro:  # noqa: BLE001 — um PDF com problema não pode impedir a publicação
                aviso(f"{arq.name}: não foi possível processar o PDF ({erro})")
                if trocado:  # o arquivo foi trocado e não deu para conferir: tira do site por segurança
                    pdfs[fid] = {"bloqueado": f"arquivo trocado no Drive e não foi possível conferir ({erro})"}
                    salvar(dados)
    salvar(dados)
    print(f"PDFs processados agora: {novos}")


def so_conferir() -> int:
    """Conferência rápida (só os primeiros bytes de cada arquivo), usada a cada 10 minutos pelo
    workflow "Buscar alterações do painel". Escreve TROCADO e devolve 1 se algum arquivo do Drive
    mudou desde a última conferência — aí o workflow manda publicar, e a publicação confere de verdade."""
    pdfs = json.loads(ARQ_PROCESSADOS.read_text(encoding="utf-8"))["pdfs"]
    from concurrent.futures import ThreadPoolExecutor

    def checar(arq):
        e = json.loads(arq.read_text(encoding="utf-8"))
        fid = id_do_drive(e.get("linkDrive", ""))
        atual = pdfs.get(fid or "", {})
        if e.get("esconder") or not fid or "bytes" not in atual:
            return None
        try:
            e_pdf, tamanho, alterado = espiar(fid)
        except Exception:  # noqa: BLE001 — Drive fora do ar: confere na próxima
            return None
        if not e_pdf or (tamanho is not None and tamanho != atual["bytes"]) or (alterado and alterado != atual.get("alterado")):
            return arq.name
        return None

    with ThreadPoolExecutor(8) as grupo:  # 8 de cada vez: termina em segundos
        trocados = [n for n in grupo.map(checar, sorted(PASTA_MATERIAIS.glob("*.json"))) if n]
    for nome in trocados:
        aviso(f"{nome}: o arquivo no Drive foi alterado — a publicação vai conferir de novo.")
    if trocados:
        print("TROCADO")
    return 1 if trocados else 0


if __name__ == "__main__":
    sys.exit(so_conferir() if "--so-conferir" in sys.argv else main())
