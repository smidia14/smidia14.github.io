"""Gera a planilha que a secretaria completa: catalogo-igrejas.xlsx"""
from pathlib import Path
from PIL import Image
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment
from dados import IGREJAS, HORARIO_PADRAO

PASTA = Path(__file__).parent
# python gerar_planilha.py --google  → versão para subir no Google Drive (fotos via =IMAGE)
import sys, json
GOOGLE = "--google" in sys.argv
IDS_DRIVE = json.loads((PASTA / "ids-fotos-drive.json").read_text()) if GOOGLE else {}
MINI = PASTA / "fotos" / "miniaturas"; MINI.mkdir(exist_ok=True)
AZUL, AMARELO, CINZA = "154D7D", "FFF2B3", "E6E7E8"
F = "Arial"
fino = Side(style="thin", color="BFC3C7")
borda = Border(left=fino, right=fino, top=fino, bottom=fino)
topo = Alignment(vertical="center", wrap_text=True)

wb = Workbook()
ws = wb.active; ws.title = "Igrejas"
cols = [("Nº", 5), ("Foto principal", 14 if GOOGLE else 22), ("Igreja", 18), ("Cidade", 18), ("UF", 5),
        ("Endereço (rua, nº, bairro)", 38), ("CEP", 11), ("Pastor responsável", 24),
        ("Dias e horários dos cultos", 30), ("Telefone / WhatsApp", 18),
        ("Autorizou divulgar telefone e foto?", 17), ("Link do Google Maps", 26),
        ("Arquivos de foto (pasta fotos)", 26), ("Observações", 40), ("O que ainda falta", 30)]
for i, (t, w) in enumerate(cols, 1):
    c = ws.cell(1, i, t)
    c.font = Font(name=F, bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=AZUL)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True); c.border = borda
    ws.column_dimensions[c.column_letter].width = w
ws.row_dimensions[1].height = 56
ws.freeze_panes = "D2"

# O que já foi escrito na planilha vale mais que dados.py: lê a planilha atual e mantém tudo.
ARQ = PASTA / "catalogo-igrejas.xlsx"
ja_escrito = {}
if ARQ.exists():
    from openpyxl import load_workbook
    antiga = load_workbook(ARQ)["Igrejas"]
    for linha in antiga.iter_rows(min_row=2, values_only=True):
        if isinstance(linha[0], int):
            ja_escrito[linha[0]] = [v.strip() if isinstance(v, str) else v for v in linha[2:14]]

for n, (id_, nome, cidade, uf, _estado, end, cep, fotos, obs) in enumerate(IGREJAS, 1):
    r = n + 1
    arquivos = ", ".join(f"{id_}-{i}.jpg" for i in range(1, len(fotos) + 1))
    valores = [n, None, nome, cidade, uf, end or None, cep or None, None, HORARIO_PADRAO, None, None, None,
               arquivos or "(sem foto)", obs or None,
               f'=IF(AND(F{r}<>"",G{r}<>"",H{r}<>"",I{r}<>"",K{r}<>""),"Completo ✔",'
               f'"Falta: "&MID(IF(F{r}="",", endereço","")&IF(G{r}="",", CEP","")&IF(H{r}="",", pastor","")'
               f'&IF(I{r}="",", horários","")&IF(K{r}="",", autorização",""),3,200))']
    if n in ja_escrito:  # colunas C até N (Igreja ... Observações)
        valores[2:14] = [v if v != "" else None for v in ja_escrito[n]]
    for i, v in enumerate(valores, 1):
        c = ws.cell(r, i, v); c.font = Font(name=F, size=10); c.alignment = topo; c.border = borda
    ws.cell(r, 1).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(r, 5).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(r, 3).font = Font(name=F, size=11, bold=True, color=AZUL)
    ws.row_dimensions[r].height = 40 if GOOGLE else 92
    if fotos and GOOGLE:  # Google Planilhas: foto puxada da pasta Fotos do Drive
        # As fotos ficam numa pasta privada: link que abre a foto para quem tem acesso
        c = ws.cell(r, 2, f'=HYPERLINK("https://drive.google.com/file/d/{IDS_DRIVE[id_ + "-1.jpg"]}/view","📷 Ver foto")')
        c.font = Font(name=F, size=10, color="1A5FB4", underline="single"); c.alignment = Alignment(horizontal="center", vertical="center")
    elif fotos:
        im = Image.open(PASTA / "fotos" / f"{id_}-1.jpg"); im.thumbnail((150, 112))
        p = MINI / f"{id_}.png"; im.save(p)
        x = XLImage(str(p)); ws.add_image(x, f"B{r}")

ult = len(IGREJAS) + 1
# Amarelo nas células que ainda precisam ser preenchidas (some quando preencher)
ws.conditional_formatting.add(f"F2:L{ult}", FormulaRule(formula=["LEN(TRIM(F2))=0"], fill=PatternFill(bgColor=AMARELO)))
ws.conditional_formatting.add(f"O2:O{ult}", FormulaRule(formula=['LEFT(O2,8)="Completo"'], font=Font(color="2E7D32", bold=True)))
ws.conditional_formatting.add(f"O2:O{ult}", FormulaRule(formula=['LEFT(O2,5)="Falta"'], font=Font(color="B3261E")))
dv = DataValidation(type="list", formula1='"Sim,Não"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"K2:K{ult}")
ws["H1"].comment = Comment("Os pastores mudaram: preencher com o nome atual (ex.: Pr. João da Silva).", "Catálogo")
ws["K1"].comment = Comment("LGPD: só colocar telefone e foto do pastor se ele autorizar (pode ser por mensagem).", "Catálogo")
ws["O1"].comment = Comment("Coluna automática: não precisa mexer.", "Catálogo")
ws.auto_filter.ref = f"A1:O{ult}"

# Aba de instruções
co = wb.create_sheet("Como preencher", 0)
co.column_dimensions["A"].width = 30; co.column_dimensions["B"].width = 70
linhas = [
    ("CATÁLOGO DAS IGREJAS DO BRASIL – 2026", None),
    ("Dados tirados da lista de 04/11/2026. Os contatos que estão hoje no site estão desatualizados: não copiar de lá.", None),
    (None, None),
    ("COMO PREENCHER", None),
    ("Células amarelas", "Ainda estão vazias e precisam ser preenchidas. Ficam brancas sozinhas quando você escreve."),
    ("Coluna \"O que ainda falta\"", "É automática. Mostra o que falta em cada igreja. Não precisa mexer."),
    ("Fotos", "Ficam na pasta \"fotos\". A foto 1 é a principal (vai no card). Para trocar, mande a foto nova com o nome da igreja."),
    ("Foto boa para o card", "De preferência a fachada, de dia, com o celular deitado. Foto do Google Street View também serve."),
    ("Horários dos cultos", "Já vêm preenchidos com o padrão (Dom e Qua 19h30 · Sáb 9h30). Só mude se a igreja tiver horário diferente."),
    ("Autorização (LGPD)", "Escolha Sim ou Não. Só divulgamos telefone e foto do pastor com autorização dele."),
    (None, None),
    ("EXEMPLO DE LINHA PREENCHIDA", "(exemplo inventado, só para mostrar o formato)"),
    ("Igreja", "Curitiba"),
    ("Endereço", "Rua Sebastião Lima, 217 – Alto do Boqueirão"),
    ("CEP", "81850-550"),
    ("Pastor responsável", "Pr. João da Silva"),
    ("Dias e horários dos cultos", "Dom e Qua 19h30 · Sáb 9h30"),
    ("Telefone / WhatsApp", "(41) 99999-0000"),
    ("Autorizou divulgar?", "Sim"),
    ("Link do Google Maps", "https://maps.app.goo.gl/... (abrir o Maps, procurar o endereço, tocar em Compartilhar e copiar o link)"),
    (None, None),
    ("RESUMO", None),
    ("Total de igrejas", f"=COUNTA(Igrejas!C2:C{ult})"),
    ("Igrejas completas", f'=COUNTIF(Igrejas!O2:O{ult},"Completo*")'),
    ("Igrejas com algo faltando", f'=COUNTIF(Igrejas!O2:O{ult},"Falta*")'),
]
for r, (a, b) in enumerate(linhas, 1):
    ca, cb = co.cell(r, 1, a), co.cell(r, 2, b)
    ca.font = Font(name=F, size=10, bold=True); cb.font = Font(name=F, size=10)
    ca.alignment = cb.alignment = Alignment(vertical="top", wrap_text=True)
    if a in ("COMO PREENCHER", "EXEMPLO DE LINHA PREENCHIDA", "RESUMO"):
        ca.font = Font(name=F, size=11, bold=True, color="FFFFFF"); ca.fill = PatternFill("solid", fgColor=AZUL)
        cb.fill = PatternFill("solid", fgColor=AZUL); cb.font = Font(name=F, size=10, italic=True, color="FFFFFF")
co["A1"].font = Font(name=F, size=16, bold=True, color=AZUL)
co.merge_cells("A2:B2"); co["A2"].font = Font(name=F, size=10, italic=True, color="555555"); co.row_dimensions[2].height = 28
co["A5"].fill = PatternFill("solid", fgColor=AMARELO)
for r in range(12, 20): co.cell(r, 2).fill = PatternFill("solid", fgColor="F3F6F9")


# Aba que o site lê (publicada na web como CSV). Só fórmulas: ninguém mexe aqui.
# O telefone só aparece se a autorização for "Sim" (LGPD). Cobre até 300 igrejas.
ps = wb.create_sheet("Para o site")
cab = ["Igreja", "Cidade", "UF", "Endereço", "CEP", "Pastor", "Horários", "Telefone", "Google Maps", "Fotos"]
orig = ["C", "D", "E", "F", "G", "H", "I", None, "L", "M"]
for i, t in enumerate(cab, 1):
    c = ps.cell(1, i, t); c.font = Font(name=F, bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=AZUL)
    ps.column_dimensions[c.column_letter].width = 22
for r in range(2, 302):
    for i, col in enumerate(orig, 1):
        if col is None:
            f = f'=IF(Igrejas!K{r}="Sim",Igrejas!J{r}&"","")'
        else:
            f = f'=IF(Igrejas!$C{r}="","",Igrejas!{col}{r}&"")'
        ps.cell(r, i, f).font = Font(name=F, size=10)
ps.sheet_properties.tabColor = "83A371"
ps["L1"] = "Aba automática: o site lê esta aba. Não precisa mexer."
ps["L1"].font = Font(name=F, italic=True, color="555555")

wb.calculation.fullCalcOnLoad = True
wb.save(PASTA / "catalogo-igrejas-google.xlsx" if GOOGLE else ARQ)
print("ok")
