"""Tira as fotos do Word, aplica o mesmo corte que o Word mostra e salva em fotos/<id>-N.jpg."""
import sys, zipfile, io, re
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageOps
from dados import IGREJAS

docx = Path(sys.argv[1])
saida = Path(__file__).parent / "fotos"; saida.mkdir(exist_ok=True)
z = zipfile.ZipFile(docx)
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("word/_rels/document.xml.rels"))}
doc = ET.fromstring(z.read("word/document.xml"))
cortes = {}
for bf in doc.iter("{http://schemas.openxmlformats.org/drawingml/2006/picture}blipFill"):
    blip = bf.find("{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
    sr = bf.find("{http://schemas.openxmlformats.org/drawingml/2006/main}srcRect")
    nome = Path(rels[blip.get(R + "embed")]).stem
    c = {k: int(sr.get(k, 0)) / 100000 for k in "ltrb"} if sr is not None else {}
    cortes[nome] = c
arquivos = {Path(n).stem: n for n in z.namelist() if n.startswith("word/media/")}
for id_, *_, fotos, _obs in IGREJAS:
    for i, f in enumerate(fotos, 1):
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(z.read(arquivos[f])))).convert("RGB")
        c = cortes.get(f, {})
        if c:
            w, h = im.size
            im = im.crop((round(w * c.get("l", 0)), round(h * c.get("t", 0)),
                          round(w * (1 - c.get("r", 0))), round(h * (1 - c.get("b", 0)))))
        im.save(saida / f"{id_}-{i}.jpg", quality=90)
        print(f"{id_}-{i}.jpg", im.size, "corte" if c else "")
