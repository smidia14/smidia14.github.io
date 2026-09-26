// Qual proposta de arte está ativa: ?arte=a, ?arte=b ou ?arte=c no endereço.
// A escolha fica lembrada neste navegador, para as páginas internas usarem a mesma.
// Sem escolha, vale a proposta A.

export type Proposta = "a" | "b" | "c";
export const PADRAO: Proposta = "a";
const CHAVE = "arte-escolhida";

export function propostaAtiva(): Proposta {
  const valida = (v: string | null | undefined): v is Proposta => v === "a" || v === "b" || v === "c";
  const doEndereco = new URLSearchParams(location.search).get("arte")?.toLowerCase();
  if (valida(doEndereco)) {
    try {
      localStorage.setItem(CHAVE, doEndereco);
    } catch {
      /* navegação privada: só não lembra */
    }
    return doEndereco;
  }
  try {
    const guardada = localStorage.getItem(CHAVE);
    if (valida(guardada)) return guardada;
  } catch {
    /* sem acesso ao armazenamento */
  }
  return PADRAO;
}
