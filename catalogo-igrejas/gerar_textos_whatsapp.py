"""Gera os textos do catálogo do WhatsApp Business e copia os cards com nomes fáceis de achar
no celular. Saída: whatsapp/ (fica fora do git). Rode antes: python ../site/scripts/baixar_igrejas.py
e python gerar_cards.py"""
import json, shutil
from pathlib import Path

PASTA = Path(__file__).parent
SITE = PASTA.parent / "site"
ENDERECO_SITE = "https://smidia14.github.io"
SAIDA = PASTA / "whatsapp"; shutil.rmtree(SAIDA, ignore_errors=True); (SAIDA / "Cards").mkdir(parents=True)

igrejas = json.loads((SITE / "src/data/igrejas.json").read_text(encoding="utf-8"))["igrejas"]
igrejas.sort(key=lambda i: (i["estado"], i["nome"]))

def nome_item(i):
    return f'{i["nome"]} – {i["uf"]}' if i["nome"] == i["cidade"] else f'{i["nome"]} – {i["cidade"]}/{i["uf"]}'

def descricao(i):
    end = ", ".join(x for x in [i["endereco"], f'{i["cidade"]} - {i["uf"]}', i["cep"] and f'CEP {i["cep"]}'] if x) if i["endereco"] else f'Endereço em breve ({i["cidade"]} - {i["uf"]})'
    linhas = [f"📍 {end}", f'🕖 Cultos: {i["horarios"]}']
    if i["pastor"]: linhas.append(f'🙏 Responsável: {i["pastor"]}')
    if i["telefone"]: linhas.append(f'📞 Contato: {i["telefone"]}')
    linhas.append("🗺️ Mapa, fotos e mais informações no link.")
    return "\n".join(linhas)

t = ["CATÁLOGO DO WHATSAPP BUSINESS – IGREJAS DO BRASIL", "",
     "COMO CADASTRAR CADA IGREJA (no app WhatsApp Business):",
     "1. Toque em ⋮ (ou Configurações) → Ferramentas comerciais → Catálogo → Adicionar novo item.",
     "2. Imagem: escolha o card da igreja (pasta \"Cards\" no Drive, já com o nome do estado e da igreja).",
     "3. Nome do item: copie o NOME abaixo.",
     "4. Preço: deixe em branco.",
     "5. Descrição: copie a DESCRIÇÃO abaixo.",
     "6. Em \"Mais campos\": Link → copie o LINK; Código do item → copie o CÓDIGO.",
     "7. Salve. Depois de cadastrar todas, crie as coleções (Catálogo → Adicionar nova coleção), uma por estado, e coloque as igrejas de cada estado nela.",
     "", "Dica: ao trocar o pastor ou o telefone, edite só a descrição do item e troque a imagem pelo card novo.", ""]
estado = None
for n, i in enumerate(igrejas, 1):
    if i["estado"] != estado:
        estado = i["estado"]
        t += ["", "=" * 40, f"COLEÇÃO: {estado.upper()}", "=" * 40]
    arq = f'{i["estado"]} - {i["nome"]}.jpg'
    shutil.copy(PASTA / "cards" / f'{i["id"]}.jpg', SAIDA / "Cards" / arq)
    t += ["", f"— {n}. {i['nome']} —", f"Imagem: {arq}", "", "NOME:", nome_item(i), "", "DESCRIÇÃO:", descricao(i), "",
          "LINK:", f'{ENDERECO_SITE}/igrejas/{i["id"]}/', "", "CÓDIGO:", i["id"]]
(SAIDA / "Textos do catálogo do WhatsApp.txt").write_text("\n".join(t) + "\n", encoding="utf-8")
print(len(igrejas), "itens")
