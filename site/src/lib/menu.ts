// Lê o menu do arquivo de dados src/data/menu.json.
// Para mudar o menu (ordem, nomes, itens), edite só esse arquivo.
import dadosMenu from "../data/menu.json";

export interface ItemMenu {
  titulo: string;
  href: string;
  filhos: ItemMenu[];
}

export const menu: ItemMenu[] = dadosMenu;

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
