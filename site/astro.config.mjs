// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { remarkIncorporados, remarkSemTituloRepetido, rehypeImagensELinks } from "./src/lib/markdown.mjs";

// https://astro.build/config
export default defineConfig({
  markdown: {
    remarkPlugins: [remarkIncorporados, remarkSemTituloRepetido],
    rehypePlugins: [rehypeImagensELinks],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
