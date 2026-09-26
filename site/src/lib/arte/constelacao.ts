// PROPOSTA C — CONSTELAÇÃO
// Pontos de luz ligados por linhas finas, movendo-se devagar.
// No computador, são atraídos suavemente pelo mouse; no celular (e também no
// computador), cada ponto está a uma "distância" diferente e se desloca ao rolar,
// então as ligações se refazem conforme a página rola.
import { entre, type FabricaDeCena } from "./motor";

interface Ponto {
  x: number;
  y: number;
  vx: number; // pixels por segundo
  vy: number;
  raio: number;
  profundidade: number; // 0..1: quanto se desloca ao rolar
  dourado: boolean;
}

export const constelacao: FabricaDeCena = (ctx, amb) => {
  const sutil = amb.modo === "sutil";
  let pontos: Ponto[] = [];
  let alcance = 150; // distância máxima para ligar dois pontos
  let fundo: CanvasGradient | null = null;
  const posX = new Float32Array(200);
  const posY = new Float32Array(200);

  return {
    redimensionar() {
      const { largura: L, altura: A } = amb;
      const maximo = sutil ? (amb.leve ? 18 : 36) : amb.leve ? 40 : 95;
      const quantidade = Math.min(maximo, 200, Math.round((L * A) / (sutil ? 7000 : 11000)));
      alcance = sutil ? 120 : amb.leve ? 115 : 160;
      pontos = Array.from({ length: quantidade }, () => {
        const angulo = entre(0, Math.PI * 2);
        const vel = entre(5, 14);
        return {
          x: entre(0, L),
          y: entre(0, A),
          vx: Math.cos(angulo) * vel,
          vy: Math.sin(angulo) * vel,
          raio: entre(0.9, 2.2),
          profundidade: entre(0.05, 0.45),
          dourado: Math.random() < 0.16,
        };
      });
      if (!sutil) {
        fundo = ctx.createRadialGradient(L * 0.3, A * 0.2, 0, L * 0.5, A * 0.5, Math.max(L, A) * 0.9);
        fundo.addColorStop(0, amb.cor("principal"));
        fundo.addColorStop(1, amb.cor("principal-escuro"));
      }
    },

    quadro(_t, dt) {
      const { largura: L, altura: A, ponteiro } = amb;
      const s = dt / 1000;
      if (sutil || !fundo) ctx.clearRect(0, 0, L, A);
      else {
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, L, A);
      }

      const rolagem = amb.rolagem();
      const corLinha = sutil ? "principal" : "apoio";
      const intensidade = sutil ? 0.16 : 0.4;

      // movimento
      for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i];
        if (ponteiro.ativo && !sutil && s > 0) {
          // atração suave em direção ao mouse, só para pontos próximos
          const dx = ponteiro.x - p.x;
          const dy = ponteiro.y - (p.y - rolagem * p.profundidade);
          const d2 = dx * dx + dy * dy;
          if (d2 < 220 * 220 && d2 > 400) {
            const forca = 18 / Math.sqrt(d2);
            p.vx += dx * forca * s;
            p.vy += dy * forca * s;
          }
        }
        // mantém a velocidade calma
        const v = Math.hypot(p.vx, p.vy);
        if (v > 22) {
          p.vx *= 0.96;
          p.vy *= 0.96;
        }
        p.x += p.vx * s;
        p.y += p.vy * s;
        // dá a volta nas bordas
        if (p.x < -20) p.x = L + 20;
        else if (p.x > L + 20) p.x = -20;
        const alturaTotal = A + rolagem * 0.5 + 40;
        if (p.y < -20) p.y = alturaTotal;
        else if (p.y > alturaTotal) p.y = -20;
        posX[i] = p.x;
        posY[i] = p.y - rolagem * p.profundidade;
      }

      // linhas entre pontos próximos
      ctx.lineWidth = 1;
      ctx.strokeStyle = amb.cor(corLinha);
      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const dx = posX[i] - posX[j];
          const dy = posY[i] - posY[j];
          const d2 = dx * dx + dy * dy;
          if (d2 > alcance * alcance) continue;
          ctx.globalAlpha = (1 - Math.sqrt(d2) / alcance) * intensidade;
          ctx.beginPath();
          ctx.moveTo(posX[i], posY[i]);
          ctx.lineTo(posX[j], posY[j]);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;

      // linhas douradas finas até o mouse
      if (ponteiro.ativo && !sutil) {
        for (let i = 0; i < pontos.length; i++) {
          const dx = posX[i] - ponteiro.x;
          const dy = posY[i] - ponteiro.y;
          const d = Math.hypot(dx, dy);
          if (d > 190) continue;
          ctx.strokeStyle = amb.cor("dourado", (1 - d / 190) * 0.5);
          ctx.beginPath();
          ctx.moveTo(posX[i], posY[i]);
          ctx.lineTo(ponteiro.x, ponteiro.y);
          ctx.stroke();
        }
      }

      // os pontos de luz
      for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i];
        const nome = p.dourado ? "dourado" : sutil ? "principal" : "apoio";
        if (!sutil) {
          ctx.fillStyle = amb.cor(nome, 0.15); // halo
          ctx.beginPath();
          ctx.arc(posX[i], posY[i], p.raio * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = amb.cor(nome, sutil ? 0.45 : 0.95);
        ctx.beginPath();
        ctx.arc(posX[i], posY[i], p.raio, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
};
