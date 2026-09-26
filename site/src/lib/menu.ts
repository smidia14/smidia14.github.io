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
