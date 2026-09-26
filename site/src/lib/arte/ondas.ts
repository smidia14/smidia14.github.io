// PROPOSTA B — ONDAS
// Camadas de ondas abstratas em tons de azul, cada uma num ritmo diferente,
// com leve efeito de profundidade ao rolar a página (camadas do fundo se movem menos).
import { entre, type FabricaDeCena } from "./motor";

interface Camada {
  base: number; // altura da linha média (0 = topo, 1 = base)
  amplitude: number; // fração da altura
  onda1: number; // comprimento de onda (pixels)
  onda2: number;
  velocidade1: number;
  velocidade2: number;
  fase: number;
  profundidade: number; // 0 = fundo (longe), 1 = frente (perto)
}

export const ondas: FabricaDeCena = (ctx, amb) => {
  const sutil = amb.modo === "sutil";
  let camadas: Camada[] = [];
  let passo = 10;

  // Cor de cada camada: do azul bebê translúcido (longe) ao azul escuro (perto)
  function corDaCamada(i: number, total: number) {
    const f = i / (total - 1);
    if (sutil) {
      // topo das páginas internas: tons claros; a última camada é o próprio fundo da página
      return i === total - 1 ? amb.cor("fundo") : amb.cor("apoio", 0.18 + f * 0.25);
    }
    if (f < 0.5) return amb.cor("apoio", 0.1 + f * 0.24);
    return amb.cor(f < 0.8 ? "principal" : "principal-escuro", 0.55 + f * 0.45);
  }

  return {
    resolucaoMaxima: 1, // ondas são formas suaves: resolução normal basta e pesa 3x menos
    redimensionar() {
      const total = sutil ? 3 : amb.leve ? 4 : 6;
      passo = sutil ? 12 : 6; // distância entre os pontos da linha (menor = curva mais lisa)
      // em telas estreitas as ondas não encolhem demais (senão ficam "pontudas")
      const largo = Math.max(amb.largura, 900);
      camadas = Array.from({ length: total }, (_, i) => {
        const f = i / (total - 1);
        return {
          // páginas internas: ondas finas logo abaixo do menu, acima do título (não passam atrás do texto)
          base: sutil ? 0.3 + f * 0.1 : 0.42 + f * 0.36,
          amplitude: sutil ? 0.025 + f * 0.01 : 0.03 + f * 0.035,
          onda1: entre(0.7, 1.2) * largo,
          onda2: entre(0.3, 0.5) * largo,
          velocidade1: entre(0.00008, 0.00016) * (i % 2 ? 1 : -1),
          velocidade2: entre(0.00018, 0.0003) * (i % 2 ? -1 : 1),
          fase: entre(0, Math.PI * 2),
          profundidade: f,
        };
      });
    },

    quadro(t) {
      const { largura: L, altura: A } = amb;
      if (sutil) {
        ctx.clearRect(0, 0, L, A);
      } else {
        const fundo = ctx.createLinearGradient(0, 0, 0, A);
        fundo.addColorStop(0, amb.cor("principal-escuro"));
        fundo.addColorStop(1, amb.cor("principal"));
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, L, A);
      }

      // profundidade ao rolar: camadas de trás "ficam para trás" (descem junto com a rolagem)
      const rolagem = Math.min(amb.rolagem(), A);
      const total = camadas.length;
      const linhaDourada = sutil ? total - 2 : Math.floor(total / 2);

      camadas.forEach((c, i) => {
        const deslocamento = rolagem * (1 - c.profundidade) * (sutil ? 0.15 : 0.35);
        const y0 = A * c.base + deslocamento;
        const amp = A * c.amplitude;
        const k1 = (Math.PI * 2) / c.onda1;
        const k2 = (Math.PI * 2) / c.onda2;
        const altura = (x: number) =>
          y0 +
          amp * (Math.sin(x * k1 + t * c.velocidade1 + c.fase) * 0.65 + Math.sin(x * k2 + t * c.velocidade2 + c.fase * 2) * 0.35);

        ctx.beginPath();
        ctx.moveTo(0, A + 2);
        for (let x = 0; x <= L + passo; x += passo) ctx.lineTo(x, altura(x));
        ctx.lineTo(L, A + 2);
        ctx.closePath();
        ctx.fillStyle = corDaCamada(i, total);
        ctx.fill();

        // fio fino na crista de algumas ondas: dourado (destaque) e azul bebê
        if (i === linhaDourada || (!sutil && i === 1)) {
          ctx.beginPath();
          for (let x = 0; x <= L + passo; x += passo) ctx.lineTo(x, altura(x));
          ctx.lineWidth = 1;
          ctx.strokeStyle = i === linhaDourada ? amb.cor("dourado", sutil ? 0.55 : 0.7) : amb.cor("apoio", 0.45);
          ctx.stroke();
        }
      });
    },
  };
};
