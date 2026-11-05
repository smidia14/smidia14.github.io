import antigas from "../data/imagens-antigas.json";

// Segurança dos links que vêm do painel da equipe (página inicial, redes sociais,
// Conferência Geral): só deixa passar endereços normais. Um link do tipo "javascript:"
// (que rodaria código no navegador de quem visita) vira "#" e não faz nada.
export function linkSeguro(link: string | null | undefined): string {
  const l = (link ?? "").trim();
  if (!l) return "#";
  if (l.startsWith("/") && !l.startsWith("//")) return l; // página do próprio site
  if (l.startsWith("#")) return l;
  try {
    const u = new URL(l);
    return ["https:", "http:", "mailto:", "tel:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
}

/** Imagem que ainda aponta para o site antigo (Webnode): usa a cópia guardada no próprio site. */
export function imagemLocal(endereco: string | null | undefined): string {
  const e = (endereco ?? "").trim();
  return (antigas.imagens as Record<string, string>)[e] ?? e;
}

// Links antigos do Google Drive que ainda aparecem nos dados da página inicial: o material
// agora está na biblioteca do site (ou na vitrine de livros).
const DRIVE_ANTIGO: Record<string, string> = {
  "1EsI1QIeIm-uVa6Ok-XTNByDajDQi1Xbx": "/biblioteca/2020-semana-de-oracao-crescimento-espiritual/",
  "1y3vfC9Cl410w0i-m83t-na4x5Di7vEG2": "/biblioteca/2019-semana-de-reavivamento-mulheres-de-fe/",
  "1m9opdrHe-TUspyZqBWyZ_M5sbgB-YQ1d": "/download/livros/",
  "1ipAwzdX4v7v1SMYYkPwjtYLLfGRhaB3H": "/download/livros/",
  "0B2sWogup0xGMenZ3bWRKMDlKUnM": "/download/livros/",
};

/** Link de capa ou cartão: troca links antigos do Drive pela página nova e filtra os perigosos. */
export function linkAtual(link: string | null | undefined): string {
  const id = (link ?? "").match(/(?:\/d\/|[?&]id=)([\w-]{20,})/)?.[1];
  return linkSeguro(id && DRIVE_ANTIGO[id] ? DRIVE_ANTIGO[id] : link);
}
