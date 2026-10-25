// Biblioteca de PDFs: um arquivo por material em src/data/biblioteca/ (editados pelo painel),
// mais os dados gerados automaticamente na publicação (src/data/pdfs-processados.json:
// tamanho, páginas, capa da 1ª página e prévias). Diz quais materiais aparecem em cada página.
import processados from "../data/pdfs-processados.json";
import { menu, itemDoMenu } from "./menu";

/** Como o material está escrito no arquivo (os campos do formulário do painel). */
interface Entrada {
  titulo: string;
  secao: string | null;
  ano: string;
  semestre: string;
  publico: "adulto" | "infantil";
  origem: string;
  linkDrive: string;
  capaModo: "primeira-pagina" | "padrao" | "imagem";
  capaImagem?: string;
  linkOficial?: string;
  observacao?: string;
  esconder?: boolean;
}

interface Processado {
  tamanhoMB?: number;
  paginas?: number;
  capa?: string;
  previas?: string[];
}

export interface Material {
  slug: string; // nome do arquivo = endereço da página do material
  titulo: string;
  secao: string | null; // endereço da página do site onde o material entra
  ano: string | null;
  semestre: string | null;
  publico: "adulto" | "infantil";
  origem: string; // "editora", "site antigo" ou "Conferência Geral"
  visualizar: string;
  baixar: string;
  tamanhoMB: number | null; // null enquanto a publicação ainda não processou o PDF
  paginas: number | null;
  capa: string; // imagem ou "padrao" (capa azul feita pelo próprio site)
  pesado: boolean; // acima de 50 MB: mostra as prévias em vez do visualizador
  previas?: string[];
  linkOficial?: string;
}

export const PAGINA_LIVROS = "/download/livros/";
export const PAGINA_CRIANCAS = "/departamentos/criancas/";

/** ID do arquivo no Google Drive, a partir de qualquer link de compartilhamento. */
export function idDoDrive(link: string) {
  return (
    link.match(/\/d\/([\w-]{10,})/)?.[1] ??
    link.match(/[?&]id=([\w-]{10,})/)?.[1] ??
    null
  );
}

const arquivos = import.meta.glob<Entrada>("../data/biblioteca/*.json", {
  eager: true,
  import: "default",
});
const dadosPdf = processados.pdfs as Record<string, Processado>;

function montar(caminho: string, e: Entrada): Material | null {
  const id = idDoDrive(e.linkDrive ?? "");
  if (!id || e.esconder) return null;
  const p = dadosPdf[id] ?? {};
  const capa =
    e.capaModo === "imagem" && e.capaImagem
      ? e.capaImagem
      : e.capaModo === "primeira-pagina" && p.capa
        ? p.capa
        : "padrao";
  const mb = p.tamanhoMB ?? null;
  return {
    slug: caminho
      .split("/")
      .at(-1)!
      .replace(/\.json$/, ""),
    titulo: e.titulo,
    secao: e.secao || null,
    ano: e.ano || null,
    semestre: e.semestre || null,
    publico: e.publico === "infantil" ? "infantil" : "adulto",
    origem: e.origem,
    visualizar: `https://drive.google.com/file/d/${id}/view`,
    baixar: `https://drive.google.com/uc?export=download&id=${id}`,
    tamanhoMB: mb,
    paginas: p.paginas ?? null,
    capa,
    pesado: (mb ?? 0) > 50 && !!p.previas?.length,
    previas: p.previas,
    linkOficial: e.linkOficial || undefined,
  };
}

export const materiais: Material[] = Object.entries(arquivos)
  .map(([caminho, e]) => montar(caminho, e))
  .filter((m): m is Material => m !== null);

export const slugDe = (m: Material) => m.slug;
export const hrefDe = (m: Material) => `/biblioteca/${m.slug}/`;

/** Mais novo primeiro (ano, depois semestre); adultos antes de infantil. */
export function ordenar(lista: Material[]) {
  const chave = (m: Material) =>
    Number(m.ano ?? 0) * 10 + Number(m.semestre ?? 0);
  return [...lista].sort(
    (a, b) =>
      chave(b) - chave(a) ||
      a.publico.localeCompare(b.publico) ||
      a.titulo.localeCompare(b.titulo, "pt"),
  );
}

/** "2026 · 2º semestre", "2025" ou "" */
export function rotuloData(m: Material) {
  if (!m.ano) return "";
  return m.semestre ? `${m.ano} · ${m.semestre}º semestre` : m.ano;
}

// Páginas que mostram uma lista de materiais (ou o aviso "Em breve novos materiais").
const filhosDe = (href: string) =>
  itemDoMenu(href)?.filhos.map((f) => f.href) ?? [];
const SEMANAS = [
  "/download/semana-de-oracao/",
  "/download/semana-de-reavivamento/",
  "/download/semana-da-mordomia-crista/",
  "/departamentos/jovens/semana-da-juventude/",
  "/download/semana-do-calvario/",
  "/download/semana-juvenil/",
];
export const paginasComBiblioteca = new Set([
  ...SEMANAS,
  "/download/cursos-e-estudos/",
  ...filhosDe("/departamentos/"), // cada departamento
  ...filhosDe("/doutrinas/"), // cada doutrina
]);

/** Materiais de uma página do site.
 *  - Crianças: todos os materiais infantis.
 *  - Departamento: os seus e os das suas subpáginas (ex.: Jovens inclui a Semana da Juventude).
 *  - Outras: os ligados à própria página. */
export function materiaisDaPagina(href: string): Material[] {
  if (href === PAGINA_CRIANCAS)
    return ordenar(materiais.filter((m) => m.publico === "infantil"));
  const departamento = filhosDe("/departamentos/").includes(href);
  return ordenar(
    materiais.filter(
      (m) =>
        m.secao && (departamento ? m.secao.startsWith(href) : m.secao === href),
    ),
  );
}

/** Escola Sabatina: grupos por ano e semestre, cada um com Adultos e Infantil. */
export function porSemestre(lista: Material[]) {
  const grupos = new Map<
    string,
    { titulo: string; adultos: Material[]; infantil: Material[] }
  >();
  for (const m of ordenar(lista)) {
    const titulo = rotuloData(m) || "Sem data";
    if (!grupos.has(titulo))
      grupos.set(titulo, { titulo, adultos: [], infantil: [] });
    grupos
      .get(titulo)!
      [m.publico === "infantil" ? "infantil" : "adultos"].push(m);
  }
  return [...grupos.values()];
}

/** Migalhas da página de um material: início, caminho da seção no menu e o material. */
export function trilhaDoMaterial(m: Material) {
  const inicio = { titulo: menu[0].titulo, href: menu[0].href };
  const caminho: { titulo: string; href: string }[] = [];
  let href = m.secao ?? "";
  // sobe pelos endereços (/a/b/c/ → /a/b/ → /a/) pegando os que estão no menu
  while (href.length > 1) {
    const item = itemDoMenu(href);
    if (item) caminho.unshift({ titulo: item.titulo, href: item.href });
    href = href.replace(/[^/]+\/$/, "");
  }
  return [inicio, ...caminho, { titulo: m.titulo, href: hrefDe(m) }];
}

/** Endereço de pré-visualização do Google Drive (para embutir na página). */
export const previaDoDrive = (m: Material) =>
  m.visualizar.replace(/\/view.*$/, "/preview");
