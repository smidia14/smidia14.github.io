// PROPOSTA A — LUZ
// Fundo em gradiente azul escuro que "respira" devagar, com partículas de luz
// douradas e azul bebê subindo lentamente, como poeira luminosa.
import { entre, type FabricaDeCena } from "./motor";

interface Particula {
  x: number;
  y: number;
  raio: number;
  subida: number; // pixels por segundo
  balanco: number; // amplitude do vaivém lateral
  fase: number;
  brilho: number;
  sprite: number; // 0 = dourado, 1 = azul bebê
}

export const luz: FabricaDeCena = (ctx, amb) => {
  const sutil = amb.modo === "sutil";
  let particulas: Particula[] = [];
  let sprites: HTMLCanvasElement[] = [];

  // Um "brilho" redondo desenhado uma vez e reaproveitado (muito mais leve que desenhar gradientes)
  function criarSprite(cor: string) {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const c = s.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, cor.replace(/[\d.]+\)$/, "1)"));
    g.addColorStop(0.18, cor.replace(/[\d.]+\)$/, "0.8)"));
    g.addColorStop(0.45, cor.replace(/[\d.]+\)$/, "0.18)"));
    g.addColorStop(1, cor.replace(/[\d.]+\)$/, "0)"));
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return s;
  }

  const nova = (emQualquerAltura: boolean): Particula => ({
    x: entre(0, amb.largura),
    y: emQualquerAltura ? entre(0, amb.altura) : amb.altura + entre(10, 60),
    raio: sutil ? entre(0.8, 2) : entre(0.8, 2.8),
    subida: sutil ? entre(6, 14) : entre(10, 28),
    balanco: entre(8, 34),
    fase: entre(0, Math.PI * 2),
    brilho: entre(0.45, 1),
    sprite: Math.random() < 0.45 ? 0 : 1,
  });

  return {
    resolucaoMaxima: 1.5, // brilhos difusos não precisam de resolução "retina"
    redimensionar() {
      sprites = sutil
        ? [criarSprite(amb.cor("dourado")), criarSprite(amb.cor("principal"))]
        : [criarSprite(amb.cor("dourado")), criarSprite(amb.cor("apoio"))];
      const area = amb.largura * amb.altura;
      const maximo = sutil ? (amb.leve ? 14 : 30) : amb.leve ? 45 : 120;
      const quantidade = Math.min(maximo, Math.round(area / (sutil ? 9000 : 9500)));
      particulas = Array.from({ length: quantidade }, () => nova(true));
    },

    quadro(t, dt) {
      const { largura: L, altura: A } = amb;
      const respiro = Math.sin(t * 0.00035); // -1..1, um ciclo a cada ~18 s

      if (sutil) {
        ctx.clearRect(0, 0, L, A);
        // brilho azul bem leve que respira
        const g = ctx.createRadialGradient(L * 0.7, A * 0.1, 0, L * 0.7, A * 0.1, Math.max(L, A) * (0.55 + respiro * 0.05));
        g.addColorStop(0, amb.cor("apoio", 0.35 + respiro * 0.08));
        g.addColorStop(1, amb.cor("apoio", 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, L, A);
      } else {
        // gradiente de fundo
        const fundo = ctx.createLinearGradient(0, 0, 0, A);
        fundo.addColorStop(0, amb.cor("principal-escuro"));
        fundo.addColorStop(1, amb.cor("principal"));
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, L, A);
        // luz azul que "respira" vinda de baixo
        const raio = Math.max(L, A) * (0.75 + respiro * 0.08);
        const g = ctx.createRadialGradient(L * 0.5, A * 1.05, 0, L * 0.5, A * 1.05, raio);
        g.addColorStop(0, amb.cor("apoio", 0.28 + respiro * 0.07));
        g.addColorStop(0.5, amb.cor("apoio", 0.07));
        g.addColorStop(1, amb.cor("apoio", 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, L, A);
        // brilho dourado discreto que passeia no alto
        const gx = L * (0.72 + Math.sin(t * 0.00011) * 0.12);
        const d = ctx.createRadialGradient(gx, A * 0.15, 0, gx, A * 0.15, Math.max(L, A) * 0.45);
        d.addColorStop(0, amb.cor("dourado", 0.1 - respiro * 0.03));
        d.addColorStop(1, amb.cor("dourado", 0));
        ctx.fillStyle = d;
        ctx.fillRect(0, 0, L, A);
      }

      // partículas de luz
      ctx.globalCompositeOperation = sutil ? "source-over" : "lighter";
      const s = dt / 1000;
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        p.y -= p.subida * s;
        if (p.y < -30) {
          particulas[i] = nova(false);
          continue;
        }
        const x = p.x + Math.sin(t * 0.0005 + p.fase) * p.balanco;
        const cintila = 0.65 + 0.35 * Math.sin(t * 0.0018 + p.fase * 3);
        const someNoAlto = Math.min(1, p.y / (A * 0.35)); // vai sumindo perto do topo
        ctx.globalAlpha = Math.max(0, p.brilho * cintila * someNoAlto * (sutil ? 0.35 : 1));
        const tam = p.raio * (sutil ? 7 : 9);
        ctx.drawImage(sprites[p.sprite], x - tam / 2, p.y - tam / 2, tam, tam);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
  };
};
