"""Gera os cards 1080x1080 do catálogo do WhatsApp em cards/<id>.jpg.
Uso: python gerar_cards.py            (todas as igrejas)
     python gerar_cards.py gandu manaus  (só algumas)
Os dados de pastor e horários virão da planilha; por enquanto usa EXEMPLO quando não houver."""
import sys, subprocess, html, tempfile
from pathlib import Path
from PIL import Image
from dados import IGREJAS, HORARIO_PADRAO

PASTA = Path(__file__).parent
SITE = PASTA.parent / "site"
FONTES = SITE / "node_modules" / "@fontsource-variable"
LOGO = SITE / "public" / "marca" / "smi-horizontal-branco.svg"
SIMBOLO = SITE / "public" / "marca" / "simbolo-branco.svg"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SAIDA = PASTA / "cards"; SAIDA.mkdir(exist_ok=True)

EXEMPLO = {"pastor": "Pr. Nome do Pastor", "horarios": HORARIO_PADRAO}

MODELO = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Outfit; src: url("{outfit}") format("woff2"); font-weight: 100 900; }}
@font-face {{ font-family: Roboto; src: url("{roboto}") format("woff2"); font-weight: 100 900; }}
* {{ margin: 0; box-sizing: border-box; }}
html, body {{ width: 1080px; height: 1080px; overflow: hidden; }}
body {{ background: #154D7D; color: #fff; font-family: Roboto, sans-serif; position: relative; }}
.foto {{ height: 600px; background: {fundo_foto}; background-size: cover; background-position: center; position: relative; }}
.foto .simbolo {{ position: absolute; inset: 0; margin: auto; width: 260px; opacity: .9; }}
.uf {{ position: absolute; top: 36px; left: 40px; background: rgba(21,77,125,.92); padding: 10px 22px 10px 18px;
       border-radius: 999px; font: 600 26px Outfit; letter-spacing: .06em; display: flex; gap: 12px; align-items: center; }}
.uf i {{ width: 12px; height: 12px; border-radius: 50%; background: #B2A675; display: block; }}
.faixa {{ height: 10px; background: linear-gradient(90deg, #154D7D, #83A371 45%, #B2A675); }}
.info {{ padding: 40px 56px 0; }}
h1 {{ font: 700 {tam_nome}px/1 Outfit; letter-spacing: -.01em; }}
.cidade {{ font: 400 30px Outfit; color: #C9D8C0; margin-top: 12px; }}
ul {{ list-style: none; padding: 0; margin-top: 30px; display: grid; gap: 14px; }}
li {{ display: flex; gap: 16px; align-items: flex-start; font-size: 27px; line-height: 1.25; }}
li svg {{ flex: none; width: 30px; height: 30px; margin-top: 1px; }}
li.end {{ font-size: 23px; color: #DCE6EF; }}
.logo {{ position: absolute; right: 56px; bottom: 42px; height: 58px; }}
</style></head><body>
<div class="foto">{simbolo}<div class="uf"><i></i>{estado}</div></div>
<div class="faixa"></div>
<div class="info">
  <h1>{nome}</h1>
  <div class="cidade">{cidade_uf}</div>
  <ul>
    <li>{ic_pastor}<span>{pastor}</span></li>
    <li>{ic_hora}<span>{horarios}</span></li>
    <li class="end">{ic_local}<span>{endereco}</span></li>
  </ul>
</div>
<img class="logo" src="{logo}">
</body></html>"""

def icone(d):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="#B2A675" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
IC_PASTOR = icone('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')
IC_HORA = icone('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
IC_LOCAL = icone('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>')

def card(ig, extra=None):
    id_, nome, cidade, uf, estado, end, cep, fotos, _ = ig
    extra = extra or EXEMPLO
    foto = PASTA / "fotos" / f"{id_}-1.jpg"
    if fotos:
        fundo, simb = f'url("{foto.as_uri()}")', ""
    else:  # sem foto: degradê da marca com o símbolo
        fundo = "linear-gradient(160deg, #0E3A60 0%, #154D7D 45%, #83A371 100%)"
        simb = f'<img class="simbolo" src="{SIMBOLO.as_uri()}">'
    mesmo = cidade == nome
    endereco = ", ".join(x for x in [end, (cidade if not mesmo else ""), f"CEP {cep}" if cep else ""] if x) if end else "Endereço em breve"
    h = MODELO.format(
        outfit=(FONTES / "outfit/files/outfit-latin-wght-normal.woff2").as_uri(),
        roboto=(FONTES / "roboto/files/roboto-latin-wght-normal.woff2").as_uri(),
        fundo_foto=fundo, simbolo=simb, estado=html.escape(estado.upper()),
        nome=html.escape(nome), tam_nome=84 if len(nome) <= 16 else 66,
        cidade_uf=html.escape(f"{cidade} · {uf}" if not mesmo else f"{estado}"),
        pastor=html.escape(extra["pastor"]), horarios=html.escape(extra["horarios"]),
        endereco=html.escape(endereco), logo=LOGO.as_uri(),
        ic_pastor=IC_PASTOR, ic_hora=IC_HORA, ic_local=IC_LOCAL)
    arq_html = Path(tempfile.gettempdir()) / f"card-{id_}.html"
    arq_html.write_text(h, encoding="utf-8")
    png = SAIDA / f"{id_}.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--force-device-scale-factor=1", "--window-size=1080,1080", "--virtual-time-budget=3000",
                    f"--screenshot={png}", arq_html.as_uri()], check=True, capture_output=True)
    Image.open(png).convert("RGB").save(SAIDA / f"{id_}.jpg", quality=92); png.unlink()
    print("ok", id_)

if __name__ == "__main__":
    pedidos = set(sys.argv[1:])
    for ig in IGREJAS:
        if not pedidos or ig[0] in pedidos:
            card(ig)
