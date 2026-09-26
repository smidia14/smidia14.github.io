import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Páginas importadas de ../extracao (veja scripts/importar-conteudo.mjs)
const paginas = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/paginas",
    generateId: ({ data }) => (data.rota as string) || "inicio",
  }),
  schema: z.object({
    titulo: z.string(),
    descricao: z.string(),
    rota: z.string(),
    esta_no_menu: z.boolean(),
    url_original: z.string(),
    caminho_de_navegacao: z.string().optional(),
  }),
});

// Blocos que se repetiam em todas as páginas do site antigo (barra lateral, rodapé)
const blocos = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/blocos" }),
  schema: z.object({ titulo: z.string() }),
});

export const collections = { paginas, blocos };
