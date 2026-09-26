// Importa as páginas extraídas (../extracao) para dentro do site.
//
// - Copia cada página de extracao/paginas/ para src/content/paginas/,
//   com o texto igual. Só muda o destino dos links entre páginas
//   (de "../doutrinas.md" para o endereço do site, "/doutrinas/").
// - Gera o menu do site em src/data/menu.json, a partir de extracao/menu.json.
// - Copia os blocos repetidos (barra lateral, rodapé) para src/content/blocos/.
//
// Como rodar (dentro da pasta site/):
//   npm run importar            -> importa só se ainda não houver conteúdo
//   npm run importar -- --forcar -> apaga o conteúdo do site e importa de novo
//
// Atenção: com --forcar, o que você editou em src/content/ e src/data/menu.json
// é substituído pelo conteúdo original da extração.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTRACAO = path.resolve(SITE, "..", "extracao");
const ORIGEM = path.join(EXTRACAO, "paginas");
const DESTINO = path.join(SITE, "src", "content", "paginas");
const DESTINO_BLOCOS = path.join(SITE, "src", "content", "blocos");
const MENU_SAIDA = path.join(SITE, "src", "data", "menu.json");

const PASTA_FORA = "fora-do-menu";
const PASTA_COMP = "_compartilhado";
const PAGINA_INICIAL = "pagina-inicial";

const forcar = process.argv.includes("--forcar");
if (fs.existsSync(DESTINO) && fs.readdirSync(DESTINO).length && !forcar) {
  console.log("O site já tem conteúdo importado em src/content/paginas/.");
  console.log("Para apagar e importar de novo: npm run importar -- --forcar");
  process.exit(0);
}

// ---------- utilidades ----------
function listarMd(pasta) {
  const saida = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...listarMd(p));
    else if (item.name.endsWith(".md")) saida.push(p);
  }
  return saida;
}

const posix = (p) => p.split(path.sep).join("/");

/** Separa o cabeçalho (entre ---) do texto e lê os campos "chave: valor". */
function lerPagina(arquivo) {
  const bruto = fs.readFileSync(arquivo, "utf-8").replace(/\r\n/g, "\n");
  const m = bruto.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (m) {
    for (const linha of m[1].split("\n")) {
      const mm = linha.match(/^(\w+):\s*(.*)$/);
      if (!mm) continue;
      let v = mm[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
      meta[mm[1]] = v;
    }
  }
  return { meta, corpo: m ? bruto.slice(m[0].length) : bruto };
}

/** paginas/doutrinas/principios-de-fe.md -> "doutrinas/principios-de-fe" (endereço no site) */
function rotaDoArquivo(relativo) {
  let r = posix(relativo).replace(/\.md$/, "");
  if (r === PAGINA_INICIAL) return "";
  if (r.startsWith(PASTA_FORA + "/")) r = "arquivo/" + r.slice(PASTA_FORA.length + 1);
  return r;
}
const href = (rota) => (rota ? `/${rota}/` : "/");

const yaml = (v) => JSON.stringify(v ?? "");

// ---------- menu ----------
const menuOriginal = JSON.parse(fs.readFileSync(path.join(EXTRACAO, "menu.json"), "utf-8"));
const rotasNoMenu = new Set();
function converterMenu(itens) {
  return itens.map((it) => {
    if (!it.arquivo) throw new Error(`Item do menu sem arquivo: ${it.titulo}`);
    const rota = rotaDoArquivo(path.relative("paginas", it.arquivo));
    rotasNoMenu.add(rota);
    return { titulo: it.titulo, href: href(rota), filhos: converterMenu(it.filhos || []) };
  });
}
const menu = converterMenu(menuOriginal);

// ---------- páginas ----------
const arquivos = listarMd(ORIGEM);
const rotaPorArquivo = new Map();
for (const arq of arquivos) {
  const rel = path.relative(ORIGEM, arq);
  if (rel.split(path.sep)[0] === PASTA_COMP) continue;
  rotaPorArquivo.set(path.resolve(arq), rotaDoArquivo(rel));
}

/** Troca "](../doutrinas.md#x)" pelo endereço do site "](/doutrinas/#x)".
 *  Também protege endereços de e-mail com espaços (o site antigo tem um com dois
 *  e-mails juntos), que quebrariam o link: "](mailto:a ou b)" -> "](<mailto:a ou b>)". */
function trocarLinks(corpo, arquivo) {
  corpo = corpo.replace(/\]\((mailto:[^)<>]*\s[^)<>]*)\)/g, (_, alvo) => `](<${alvo}>)`);
  return corpo.replace(/\]\((?!https?:|mailto:|#)([^)\s]+?\.md)(#[^)\s]*)?\)/g, (tudo, alvo, frag) => {
    const destino = path.resolve(path.dirname(arquivo), decodeURIComponent(alvo));
    const rota = rotaPorArquivo.get(destino);
    if (rota === undefined) {
      console.warn(`  aviso: link para arquivo inexistente em ${posix(path.relative(ORIGEM, arquivo))}: ${alvo}`);
      return tudo;
    }
    return `](${href(rota)}${frag || ""})`;
  });
}

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.rmSync(DESTINO_BLOCOS, { recursive: true, force: true });
let total = 0;
for (const arq of arquivos) {
  const rel = path.relative(ORIGEM, arq);
  const { meta, corpo } = lerPagina(arq);

  if (rel.split(path.sep)[0] === PASTA_COMP) {
    const destino = path.join(DESTINO_BLOCOS, path.basename(rel));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const cab = ["---", `titulo: ${yaml(meta.titulo)}`, "---", ""].join("\n");
    fs.writeFileSync(destino, cab + trocarLinks(corpo, arq));
    continue;
  }

  const rota = rotaDoArquivo(rel);
  const cab = [
    "---",
    `titulo: ${yaml(meta.titulo)}`,
    `descricao: "PENDENTE"`,
    `rota: ${yaml(rota)}`,
    `esta_no_menu: ${rotasNoMenu.has(rota)}`,
    `url_original: ${yaml(meta.url_original)}`,
    `caminho_de_navegacao: ${yaml(meta.caminho_de_navegacao)}`,
    "---",
    "",
  ].join("\n");
  const destino = path.join(DESTINO, rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, cab + trocarLinks(corpo, arq));
  total++;
}

fs.mkdirSync(path.dirname(MENU_SAIDA), { recursive: true });
fs.writeFileSync(MENU_SAIDA, JSON.stringify(menu, null, 2) + "\n");

console.log(`Importadas ${total} páginas para src/content/paginas/`);
console.log(`Menu gerado em src/data/menu.json (${rotasNoMenu.size} itens)`);
console.log("Se o site estiver aberto (npm run dev), feche-o (Ctrl+C) e abra de novo para ver as mudanças.");
