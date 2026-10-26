# Busca no Firebase o que a equipe alterou pelo painel (/admin/) e grava nos arquivos do site.
# Roda sozinho a cada 10 minutos no GitHub (.github/workflows/sincronizar.yml); se algo mudou,
# o GitHub guarda a alteração no histórico e publica o site de novo.
#
#   materiais/<nome>  →  src/data/biblioteca/<nome>.json
#   site/contatos     →  src/data/contatos.json
#   site/inicio       →  src/data/inicio.json
#   site/livraria     →  src/data/livraria.json
#   imagens/<id>      →  public/imagens/painel/<id>.webp  (os campos "painel:<id>" viram o endereço)
#
# Só lê (com a chave pública do Firebase); quem pode gravar é decidido pelas regras do banco.
# Uso: python scripts/baixar_painel.py   (dentro da pasta site/)
import base64, json, re, sys
from pathlib import Path

import requests

SITE = Path(__file__).resolve().parent.parent
DADOS = SITE / "src/data"
PASTA_MATERIAIS = DADOS / "biblioteca"
PASTA_IMAGENS = SITE / "public/imagens/painel"
CONFIG = SITE / "src/admin/firebase-config.ts"

# ordem dos campos de um material (para os arquivos ficarem sempre iguais)
CAMPOS_MATERIAL = ["titulo", "secao", "ano", "semestre", "publico", "origem", "linkDrive", "capaModo", "capaImagem", "linkOficial", "observacao", "esconder"]


def ler_config():
    texto = CONFIG.read_text(encoding="utf-8")
    pega = lambda nome: (re.search(rf'{nome}:\s*"([^"]*)"', texto) or [None, ""])[1]
    return pega("projectId"), pega("apiKey")


PROJETO, CHAVE = ler_config()
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJETO}/databases/(default)/documents"


def valor(v):
    """Converte um valor do Firestore (formato da API) em valor comum."""
    if "stringValue" in v:
        return v["stringValue"]
    if "booleanValue" in v:
        return v["booleanValue"]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "nullValue" in v:
        return None
    if "mapValue" in v:
        return {k: valor(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v:
        return [valor(x) for x in v["arrayValue"].get("values", [])]
    if "timestampValue" in v:
        return v["timestampValue"]
    return None


def documento(d):
    campos = {k: valor(x) for k, x in d.get("fields", {}).items()}
    campos.pop("alteradoEm", None)  # controle interno do painel
    return campos


def listar(colecao):
    docs, pagina = [], None
    while True:
        r = requests.get(f"{BASE}/{colecao}", params={"key": CHAVE, "pageSize": 300, **({"pageToken": pagina} if pagina else {})}, timeout=60)
        r.raise_for_status()
        j = r.json()
        docs += j.get("documents", [])
        pagina = j.get("nextPageToken")
        if not pagina:
            return docs


def ler(caminho):
    r = requests.get(f"{BASE}/{caminho}", params={"key": CHAVE}, timeout=60)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return documento(r.json())


def na_ordem(novo, modelo):
    """Mantém a ordem dos campos do arquivo atual (evita mudanças só de ordem no histórico)."""
    if isinstance(novo, dict) and isinstance(modelo, dict):
        chaves = [k for k in modelo if k in novo] + [k for k in novo if k not in modelo]
        return {k: na_ordem(novo[k], modelo.get(k)) for k in chaves}
    if isinstance(novo, list) and isinstance(modelo, list) and modelo:
        return [na_ordem(x, modelo[0]) for x in novo]
    return novo


def trocar_imagens(dado):
    """Troca "painel:<id>" pelo endereço da imagem, salvando o arquivo da imagem no site."""
    if isinstance(dado, dict):
        return {k: trocar_imagens(v) for k, v in dado.items()}
    if isinstance(dado, list):
        return [trocar_imagens(v) for v in dado]
    if isinstance(dado, str) and dado.startswith("painel:"):
        id_ = dado[7:]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", id_):  # nome estranho: ignora (segurança)
            print(f"::warning::imagem com nome inválido ignorada: {id_!r}")
            return ""
        existentes = list(PASTA_IMAGENS.glob(f"{id_}.*"))
        if existentes:
            return f"/imagens/painel/{existentes[0].name}"
        img = ler(f"imagens/{id_}")
        m = re.match(r"data:image/(\w+);base64,(.*)", (img or {}).get("dados", ""), re.S)
        if not m:
            print(f"::warning::imagem {id_} não encontrada no painel")
            return ""
        ext = {"jpeg": "jpg"}.get(m.group(1), m.group(1))
        if ext not in ("webp", "jpg", "png", "gif"):  # só fotos (SVG pode conter código)
            print(f"::warning::imagem {id_} em formato não permitido ({ext})")
            return ""
        PASTA_IMAGENS.mkdir(parents=True, exist_ok=True)
        (PASTA_IMAGENS / f"{id_}.{ext}").write_bytes(base64.b64decode(m.group(2)))
        return f"/imagens/painel/{id_}.{ext}"
    return dado


def gravar(arquivo: Path, dado):
    texto = json.dumps(dado, ensure_ascii=False, indent=2) + "\n"
    if not arquivo.exists() or arquivo.read_text(encoding="utf-8") != texto:
        arquivo.write_text(texto, encoding="utf-8")
        print(f"  alterado: {arquivo.relative_to(SITE)}")


def main():
    if not PROJETO or not CHAVE:
        print("Firebase ainda não configurado (src/admin/firebase-config.ts). Nada a fazer.")
        return 0

    # materiais da biblioteca
    docs = listar("materiais")
    if docs:  # banco vazio = painel ainda não preparado: não apaga nada do site
        nomes = set()
        for d in docs:
            nome = d["name"].rsplit("/", 1)[1]
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,120}", nome):
                print(f"::warning::material com nome inválido ignorado: {nome!r}")
                continue
            nomes.add(nome)
            m = trocar_imagens(documento(d))
            m = {k: m.get(k, "" if k != "esconder" else False) for k in CAMPOS_MATERIAL} | {k: v for k, v in m.items() if k not in CAMPOS_MATERIAL}
            gravar(PASTA_MATERIAIS / f"{nome}.json", m)
        for arq in PASTA_MATERIAIS.glob("*.json"):
            if arq.stem not in nomes:
                arq.unlink()
                print(f"  apagado: {arq.relative_to(SITE)}")
        print(f"Materiais no painel: {len(nomes)}")
    else:
        print("Nenhum material no painel ainda; a biblioteca do site fica como está.")

    # contatos, página inicial e livros
    for parte, arquivo in [("contatos", "contatos.json"), ("inicio", "inicio.json"), ("livraria", "livraria.json")]:
        novo = ler(f"site/{parte}")
        if novo is None:
            continue
        caminho = DADOS / arquivo
        atual = json.loads(caminho.read_text(encoding="utf-8"))
        if "_leia" in atual:
            novo["_leia"] = atual["_leia"]  # a explicação do arquivo continua no lugar
        gravar(caminho, na_ordem(trocar_imagens(novo), atual))
    return 0


if __name__ == "__main__":
    sys.exit(main())
