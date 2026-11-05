// Lê o menu do arquivo de dados src/data/menu.json (editado pelo painel da equipe, tela
// "Menu e páginas"). Cada aba pode estar desativada ("ativo": false): ela some do menu,
// junto com as abas que estão dentro dela, e a página dela não é publicada.
import dadosMenu from "../data/menu.json";

export interface ItemMenu {
  titulo: string;
  href: string;
  filhos: ItemMenu[];
  ativo?: boolean; // false = aba desativada
}

/** O menu inteiro, inclusive as abas desativadas (só para o painel e para saber o que não publicar). */
export const menuCompleto: ItemMenu[] = dadosMenu as ItemMenu[];

const soAtivas = (itens: ItemMenu[]): ItemMenu[] =>
  itens.filter((i) => i.ativo !== false).map((i) => ({ ...i, filhos: soAtivas(i.filhos ?? []) }));

/** O menu do site: só as abas ativas. */
export const menu: ItemMenu[] = soAtivas(menuCompleto);

/** Endereços das abas desativadas (e de tudo o que está dentro delas): essas páginas não são publicadas. */
export const desativadas = new Set<string>();
const marcar = (itens: ItemMenu[], dentroDeDesativada: boolean) =>
  itens.forEach((i) => {
    const fora = dentroDeDesativada || i.ativo === false;
    if (fora) desativadas.add(i.href);
    marcar(i.filhos ?? [], fora);
  });
marcar(menuCompleto, false);

/** Caminho no menu até o endereço (do item principal até o próprio item). */
export function trilhaNoMenu(href: string, itens: ItemMenu[] = menu): ItemMenu[] {
  for (const item of itens) {
    if (item.href === href) return [item];
    const abaixo = trilhaNoMenu(href, item.filhos);
    if (abaixo.length) return [item, ...abaixo];
  }
  return [];
}

/** Item do menu com esse endereço, se existir. */
export function itemDoMenu(href: string): ItemMenu | undefined {
  return trilhaNoMenu(href).at(-1);
}

/** O endereço está nesse item ou em algum item abaixo dele? (para marcar o item ativo) */
export function contem(item: ItemMenu, href: string): boolean {
  return item.href === href || item.filhos.some((f) => contem(f, href));
}

/** Grupo de páginas "irmãs" para a lateral e para os botões anterior/próxima.
 *  - Subpágina (ex.: Princípios de Fé): as irmãs, com a página-mãe como título do grupo.
 *  - Página principal com subpáginas (ex.: Doutrinas): as filhas, com ela mesma como título.
 *  - Sem irmãs nem filhas no menu: null. */
export function secaoDaPagina(href: string): { titulo: string; href: string; itens: ItemMenu[] } | null {
  const trilha = trilhaNoMenu(href);
  if (trilha.length >= 2) {
    const mae = trilha[trilha.length - 2];
    return { titulo: mae.titulo, href: mae.href, itens: mae.filhos };
  }
  const item = trilha.at(-1);
  if (item && item.filhos.length) return { titulo: item.titulo, href: item.href, itens: item.filhos };
  return null;
}

/** Página anterior e próxima dentro do grupo de irmãs (na ordem do menu). */
export function vizinhas(href: string) {
  const secao = secaoDaPagina(href);
  const i = secao ? secao.itens.findIndex((x) => x.href === href) : -1;
  if (!secao || i < 0) return { anterior: undefined, proxima: undefined };
  return { anterior: secao.itens[i - 1], proxima: secao.itens[i + 1] };
}
