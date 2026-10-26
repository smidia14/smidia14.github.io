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
