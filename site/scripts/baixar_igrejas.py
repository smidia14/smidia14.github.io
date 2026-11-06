# Busca a lista das igrejas na Planilha Google "Catálogo das Igrejas 2026" e grava em
# src/data/igrejas.json. Roda sozinho a cada 10 minutos no GitHub, junto com o painel
# (.github/workflows/sincronizar.yml); se algo mudou, o site é publicado de novo.
#
# O site lê só a aba "Para o site", publicada na web como CSV (Arquivo → Compartilhar →
# Publicar na Web). Nessa aba o telefone só aparece quando a autorização é "Sim".
# A planilha completa continua privada no Drive da associação.
#
# Se a planilha não responder ou vier estranha, o arquivo atual é mantido (o site não quebra).
# Uso: python scripts/baixar_igrejas.py   (dentro da pasta site/)
import csv, io, json, re, sys, unicodedata, urllib.request
from pathlib import Path

PLANILHA_CSV = (
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQaDLcVVFdGq77UmFCWlnAf45hJiKac1nP33P_Caz7DQkTqrtQ9NE7O6a1eMqhFSVybTVedpLuP_ZKX"
    "/pub?gid=878584806&single=true&output=csv"
)
SITE = Path(__file__).resolve().parent.parent
ARQUIVO = SITE / "src/data/igrejas.json"
FOTOS = SITE / "public/imagens/igrejas"
COLUNAS = ["Igreja", "Cidade", "UF", "Endereço", "CEP", "Pastor", "Horários", "Telefone", "Google Maps", "Fotos"]
ESTADOS = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal",
    "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}


def aviso(msg):
    print(f"::warning::Igrejas: {msg}")


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def um_telefone(texto):
    """Um número: devolve (como mostrar, número para links) ou (texto, "") se não der para entender."""
    d = re.sub(r"\D", "", texto)
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}", "55" + d
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}", "55" + d
    return texto.strip(), ""


def telefone(texto):
    """Um ou mais números na mesma célula ("11 98343-7580 / 11 97255-7165"): mostra todos,
    e o primeiro número que der para entender vai para os botões de WhatsApp e ligar."""
    partes = [p for p in re.split(r"\s*(?:/|;|,|\be\b|\bou\b)\s*", texto or "") if re.search(r"\d", p)]
    lidos = [um_telefone(p) for p in partes]
    return " / ".join(m for m, _ in lidos), next((n for _, n in lidos if n), "")


def link_seguro(url):
    url = (url or "").strip()
    return url if re.match(r"^https://[^\s\"'<>]+$", url) else ""


def baixar():
    pedido = urllib.request.Request(PLANILHA_CSV, headers={"User-Agent": "site-smi-sincronizar"})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return r.read().decode("utf-8")


def main():
    try:
        texto = baixar()
    except Exception as e:  # sem internet, planilha fora do ar, link despublicado...
        aviso(f"não consegui ler a planilha ({e}); mantive a lista atual.")
        return
    linhas = list(csv.reader(io.StringIO(texto)))
    if not linhas or [c.strip() for c in linhas[0][: len(COLUNAS)]] != COLUNAS:
        aviso("a aba 'Para o site' mudou de formato (as colunas não batem); mantive a lista atual.")
        return

    igrejas, usados = [], set()
    for linha in linhas[1:]:
        v = dict(zip(COLUNAS, [c.strip() for c in linha] + [""] * len(COLUNAS)))
        if not v["Igreja"]:
            continue
        fotos = [f.strip() for f in v["Fotos"].split(",") if re.fullmatch(r"[a-z0-9-]+\.jpg", f.strip())]
        # o endereço da página não muda se o nome mudar: usa o nome da foto (ex.: realengo-1.jpg)
        base = fotos[0].rsplit("-", 1)[0] if fotos else slug(v["Igreja"])
        id_, n = base, 2
        while id_ in usados:
            id_, n = f"{base}-{n}", n + 1
        usados.add(id_)
        mostrar, numero = telefone(v["Telefone"])
        uf = v["UF"].upper()
        igrejas.append({
            "id": id_,
            "nome": v["Igreja"],
            "cidade": v["Cidade"],
            "uf": uf,
            "estado": ESTADOS.get(uf, uf),
            "endereco": v["Endereço"],
            "cep": v["CEP"],
            "pastor": v["Pastor"],
            "horarios": v["Horários"],
            "telefone": mostrar,
            "telefoneNumero": numero,
            "mapa": link_seguro(v["Google Maps"]),
            # só as fotos que existem no site (fotos novas: colocar em public/imagens/igrejas/)
            "fotos": [f"/imagens/igrejas/{f[:-4]}.webp" for f in fotos if (FOTOS / f"{f[:-4]}.webp").exists()],
        })

    if not igrejas:
        aviso("a planilha veio sem nenhuma igreja; mantive a lista atual.")
        return
    novo = json.dumps({"_leia": "Gerado sozinho a partir da Planilha Google 'Catálogo das Igrejas 2026' (scripts/baixar_igrejas.py). Não editar aqui: editar a planilha.", "igrejas": igrejas}, ensure_ascii=False, indent=2) + "\n"
    if ARQUIVO.exists() and ARQUIVO.read_text(encoding="utf-8") == novo:
        print("Igrejas: nada mudou.")
        return
    ARQUIVO.write_text(novo, encoding="utf-8")
    print(f"Igrejas: {len(igrejas)} igrejas gravadas.")


if __name__ == "__main__":
    sys.exit(main())
