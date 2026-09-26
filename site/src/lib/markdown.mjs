// Ajustes de apresentação do Markdown importado. Nenhum deles muda o texto.

/** Junta todo o texto de um nó (e dos filhos). */
function textoDe(no) {
  if (!no) return "";
  if (typeof no.value === "string") return no.value;
  if (no.type === "link" && !no.children?.length) return no.url;
  return (no.children || []).map(textoDe).join("");
}

const normalizar = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * "[Conteúdo incorporado: https://www.youtube.com/embed/...]" vira o vídeo na página.
 * Outros conteúdos incorporados (rádio, etc.) também viram um quadro incorporado.
 */
export function remarkIncorporados() {
  const padrao = /^\[Conteúdo incorporado: (\S+?)\]?\]$/;
  return (arvore) => {
    arvore.children = arvore.children.map((no) => {
      if (no.type !== "paragraph") return no;
      const m = textoDe(no).trim().match(padrao);
      if (!m) return no;
      const url = m[1].replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return {
        type: "html",
        value:
          `<div class="incorporado"><iframe src="${url}" loading="lazy" title="Conteúdo incorporado" ` +
          `allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`,
      };
    });
  };
}

/** Se a página começa com um título igual ao título da página, ele não é repetido
 *  (o layout já mostra o título no topo). */
export function remarkSemTituloRepetido() {
  return (arvore, arquivo) => {
    const titulo = arquivo.data?.astro?.frontmatter?.titulo;
    const primeiro = arvore.children.find((n) => n.type !== "html" || n.value.trim());
    if (titulo && primeiro?.type === "heading" && normalizar(textoDe(primeiro)) === normalizar(titulo)) {
      arvore.children.splice(arvore.children.indexOf(primeiro), 1);
    }
  };
}

/** Imagens carregam só quando aparecem na tela; links para outros sites abrem em nova aba. */
export function rehypeImagensELinks() {
  const visitar = (no) => {
    if (no.type === "element") {
      if (no.tagName === "img") {
        no.properties.loading = "lazy";
        no.properties.decoding = "async";
        no.properties.alt ??= "";
      }
      if (no.tagName === "a" && /^https?:\/\//.test(no.properties?.href || "")) {
        no.properties.target = "_blank";
        no.properties.rel = ["noopener"];
      }
    }
    (no.children || []).forEach(visitar);
  };
  return (arvore) => visitar(arvore);
}
