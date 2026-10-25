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
# Uso: python scripts/processar_pdfs.py   (dentro da pasta site/)
import io, json, re, sys, tempfile
from pathlib import Path

import pymupdf
import requests
from PIL import Image

SITE = Path(__file__).resolve().parent.parent
PASTA_MATERIAIS = SITE / "src/data/biblioteca"
ARQ_PROCESSADOS = SITE / "src/data/pdfs-processados.json"
CAPAS, PREVIAS = SITE / "public/capas", SITE / "public/previas"
LIMITE_PESADO_MB = 50


def id_do_drive(link: str):
    m = re.search(r"/d/([\w-]{10,})", link) or re.search(r"[?&]id=([\w-]{10,})", link)
    return m.group(1) if m else None


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
        if fid in pdfs and atual.get("capa") is not None and not falta_previa:
            continue
        print(f"Processando {arq.name} ({fid})…", flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "material.pdf"
            try:
                if not baixar(fid, pdf):
                    aviso(f"{arq.name}: o Drive não entregou um PDF. Confira se o arquivo é PDF e está compartilhado como 'Qualquer pessoa com o link'.")
                    continue
                with pymupdf.open(pdf) as doc:  # fechar o PDF antes de apagar o temporário (Windows)
                    mb = round(pdf.stat().st_size / 1e6, 1)
                    info = {"tamanhoMB": mb, "paginas": len(doc)}
                    # mantém capa/prévias que já existiam (materiais antigos), senão gera
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
    salvar(dados)
    print(f"PDFs processados agora: {novos}")


if __name__ == "__main__":
    sys.exit(main())
