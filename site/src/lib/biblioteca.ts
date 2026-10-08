// Biblioteca de PDFs: lê src/data/biblioteca.json (gerado a partir da pasta do Google Drive)
// e diz quais materiais aparecem em cada página do site.
import dados from "../data/biblioteca.json";
import { menu, itemDoMenu } from "./menu";

export interface Material {
  titulo: string;
  secao: string | null; // endereço da página do site onde o material entra
  ano: string | null;
  semestre: string | null;
  publico: "adulto" | "infantil";
  tipo: string;
  origem: string; // "editora", "site antigo" ou "Conferência Geral"
  visualizar: string;
  baixar: string;
  tamanhoMB: number;
  paginas: number | null;
  capa: string; // imagem em /capas/ ou "padrao" (capa feita pelo próprio site)
  pesado: boolean; // acima de 50 MB: mostra as prévias em vez do visualizador
  previas?: string[];
  linkOficial?: string; // página/arquivo no site da Conferência Geral
  observacao?: string;
  pastaDrive: string;
}

export const PAGINA_LIVROS = "/download/livros/";
export const PAGINA_CRIANCAS = "/departamentos/criancas/";

/** Nome do material no endereço: o nome do arquivo, sem a extensão. */
export const slugDe = (m: Material) => m.pastaDrive.split("/").at(-1)!.replace(/\.[^.]+$/, "");
export const hrefDe = (m: Material) => `/biblioteca/${slugDe(m)}/`;

export const todos = dados.itens as Material[];
/** Livros só aparecem na vitrine da página Livros (sem download e sem página própria). */
export const livros = todos.filter((m) => m.tipo === "livro");
export const materiais = todos.filter((m) => m.tipo !== "livro");

/** Mais novo primeiro (ano, depois semestre); adultos antes de infantil. */
export function ordenar(lista: Material[]) {
  const chave = (m: Material) => Number(m.ano ?? 0) * 10 + Number(m.semestre ?? 0);
  return [...lista].sort(
    (a, b) => chave(b) - chave(a) || a.publico.localeCompare(b.publico) || a.titulo.localeCompare(b.titulo, "pt"),
  );
}

/** "2026 · 2º semestre", "2025" ou "" */
export function rotuloData(m: Material) {
  if (!m.ano) return "";
  return m.semestre ? `${m.ano} · ${m.semestre}º semestre` : m.ano;
}

// Páginas que mostram uma lista de materiais (ou o aviso "Em breve novos materiais").
const filhosDe = (href: string) => itemDoMenu(href)?.filhos.map((f) => f.href) ?? [];
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
  if (href === PAGINA_CRIANCAS) return ordenar(materiais.filter((m) => m.publico === "infantil"));
  const departamento = filhosDe("/departamentos/").includes(href);
  return ordenar(materiais.filter((m) => m.secao && (departamento ? m.secao.startsWith(href) : m.secao === href)));
}

/** Escola Sabatina: grupos por ano e semestre, cada um com Adultos e Infantil. */
export function porSemestre(lista: Material[]) {
  const grupos = new Map<string, { titulo: string; adultos: Material[]; infantil: Material[] }>();
  for (const m of ordenar(lista)) {
    const titulo = rotuloData(m) || "Sem data";
    if (!grupos.has(titulo)) grupos.set(titulo, { titulo, adultos: [], infantil: [] });
    grupos.get(titulo)![m.publico === "infantil" ? "infantil" : "adultos"].push(m);
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
export const previaDoDrive = (m: Material) => m.visualizar.replace(/\/view.*$/, "/preview");
