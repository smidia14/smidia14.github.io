// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { remarkIncorporados, remarkSemTituloRepetido, rehypeImagensELinks } from "./src/lib/markdown.mjs";

// https://astro.build/config
export default defineConfig({
  // Endereço do site publicado (usado na imagem de compartilhamento do WhatsApp/redes).
  // PENDENTE: confirmar o domínio definitivo do novo site.
  site: "https://www.smir14.com.br",
  markdown: {
    remarkPlugins: [remarkIncorporados, remarkSemTituloRepetido],
    rehypePlugins: [rehypeImagensELinks],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
