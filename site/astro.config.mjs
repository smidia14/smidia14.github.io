// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { remarkIncorporados, remarkSemTituloRepetido, rehypeImagensELinks } from "./src/lib/markdown.mjs";

import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";

// Endereços do site antigo (Webnode) → páginas novas. Quem chega por um link antigo
// (Google, favoritos, WhatsApp) é levado sozinho para a página certa.
// Se a página nova estiver desativada no painel, vai para a aba de cima mais próxima.
const ler = (arq) => JSON.parse(readFileSync(new URL(arq, import.meta.url), "utf8"));
const desativadas = new Set();
const marcar = (itens, fora) =>
  itens.forEach((i) => {
    const f = fora || i.ativo === false;
    if (f) desativadas.add(i.href);
    marcar(i.filhos ?? [], f);
  });
marcar(ler("./src/data/menu.json"), false);
const ativa = (href) => {
  let h = href;
  while (desativadas.has(h) && h !== "/") h = h.replace(/[^/]+\/$/, "");
  return h;
};
const redirects = Object.fromEntries(
  Object.entries(ler("./src/data/enderecos-antigos.json").enderecos).map(([de, para]) => [de, ativa(para)]),
);

// https://astro.build/config
export default defineConfig({
  // Endereço do site publicado: usado no sitemap e na imagem de compartilhamento
  // (WhatsApp/redes). Hoje o site está no GitHub Pages; quando o domínio smir14.com.br
  // for apontado para ele, troque aqui (e crie o arquivo public/CNAME).
  site: "https://smidia14.github.io",

  redirects,

  markdown: {
    remarkPlugins: [remarkIncorporados, remarkSemTituloRepetido],
    rehypePlugins: [rehypeImagensELinks],
  },

  vite: {
    plugins: [tailwindcss()],
  },

  // a Área da equipe (/admin/) não entra no sitemap (não deve aparecer no Google)
  integrations: [sitemap({ filter: (pagina) => !pagina.includes("/admin/") })],
});