// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { remarkIncorporados, remarkSemTituloRepetido, rehypeImagensELinks } from "./src/lib/markdown.mjs";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  // Endereço do site publicado: usado no sitemap e na imagem de compartilhamento
  // (WhatsApp/redes). Hoje o site está no GitHub Pages; quando o domínio smir14.com.br
  // for apontado para ele, troque aqui (e crie o arquivo public/CNAME).
  site: "https://smidia14.github.io",

  markdown: {
    remarkPlugins: [remarkIncorporados, remarkSemTituloRepetido],
    rehypePlugins: [rehypeImagensELinks],
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap()],
});