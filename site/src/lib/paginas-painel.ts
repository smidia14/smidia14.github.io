// Páginas criadas ou editadas pelo painel da equipe (tela "Menu e páginas").
// Cada uma fica em src/data/paginas/<nome>.json (o GitHub copia do Firebase a cada 10 minutos):
//   { rota, titulo, descricao, html }
// Se a rota já existe (página vinda do site antigo), o texto do painel substitui o antigo.
// O HTML é LIMPO antes de publicar: só passam formatação de texto, links, imagens e vídeos
// do YouTube (nada de scripts, estilos ou formulários).
import sanitizeHtml from "sanitize-html";
import { linkSeguro } from "./links";

export interface PaginaPainel {
  rota: string; // sem barras nas pontas, ex.: "departamentos/criancas"
  titulo: string;
  descricao?: string;
  html: string;
}

const arquivos = import.meta.glob<PaginaPainel>("../data/paginas/*.json", { eager: true, import: "default" });
export const paginasPainel: PaginaPainel[] = Object.values(arquivos).filter((p) => p && p.rota && p.titulo);
export const paginaPainel = (rota: string) => paginasPainel.find((p) => p.rota === rota);

export function htmlLimpo(html: string) {
  return sanitizeHtml(html ?? "", {
    allowedTags: [
      "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "hr",
      "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "div", "span", "iframe",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title"],
      iframe: ["src", "title", "allowfullscreen"],
      div: ["class"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedClasses: { div: ["incorporado"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com"],
    // vídeo de site não permitido: some (em vez de deixar uma caixa vazia)
    exclusiveFilter: (f: sanitizeHtml.IFrame) => f.tag === "iframe" && !f.attribs.src,
    transformTags: {
      // links para fora abrem em outra aba; endereços estranhos viram "#"
      a: (tag, attribs) => {
        const href = linkSeguro(attribs.href);
        return { tagName: "a", attribs: /^https?:/.test(href) ? { href, target: "_blank", rel: "noopener" } : { href } };
      },
    },
  } as sanitizeHtml.IOptions);
}
