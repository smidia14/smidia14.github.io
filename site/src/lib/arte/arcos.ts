// ARTE DOS ARCOS — feita com os arcos curvos do símbolo da SMI
// (o "elemento desprendido" da Trama 2, manual seção 6).
//
// Os arcos surgem, se desenham devagar (da base até a ponta, como uma vela subindo),
// fluem lentamente e somem. Às vezes aparecem os três juntos, na posição original do
// símbolo. Cores: branco e azul claro translúcidos, com raros toques de dourado.
// O logo NÃO é animado: só estes arcos soltos se movem.
import { entre, type FabricaDeCena } from "./motor";
import { ARCOS } from "./arcos-do-simbolo";

interface Arco {
  grupo: number; // arcos que nasceram juntos têm o mesmo número
  forma: number; // qual dos 3 arcos do símbolo
  x: number; // posição do centro do símbolo (px)
  y: number;
  escala: number; // altura do símbolo, em px
  giro: number; // rotação (rad)
  vx: number; // deriva (px/s)
  vy: number;
  vgiro: number; // rad/s
  cor: string;
  alfa: number; // opacidade máxima
  nasce: number; // momento em que começa a se desenhar (ms)
  desenho: number; // duração do "se desenhar" (ms)
  vida: number; // quanto tempo fica inteiro (ms)
  some: number; // duração do sumiço (ms)
}

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const arcos: FabricaDeCena = (ctx, amb) => {
  const sutil = amb.modo === "sutil";
  const formas = ARCOS.map((a) => new Path2D(a.d));
  let lista: Arco[] = [];
  let recomecar = true;
  let proximo = 0; // quando nasce o próximo grupo
  let numeroDoGrupo = 0;

  // quantos grupos ao mesmo tempo (um grupo = um arco solto ou os três juntos)
  const alvo = () => (sutil ? (amb.leve ? 1 : 2) : amb.leve ? 2 : 3);

  function cores() {
    const r = Math.random();
    if (sutil) {
      if (r < 0.1) return { cor: amb.cor("dourado"), alfa: entre(0.18, 0.26) };
      return { cor: amb.cor("azul"), alfa: entre(0.06, 0.11) };
    }
    if (r < 0.1) return { cor: amb.cor("dourado"), alfa: entre(0.45, 0.6) }; // toque raro
    if (r < 0.55) return { cor: amb.cor("branco"), alfa: entre(0.12, 0.22) };
    return { cor: amb.cor("azul-claro"), alfa: entre(0.2, 0.34) };
  }

  const DURACAO_MAXIMA = 8200 + 16000 + 4500; // desenho + vida + sumiço (ms)
  const MARGEM = 24; // px de folga em volta das áreas protegidas

  /** O arco (com a deriva que vai ter ao longo da vida) passaria por cima do logo/título? */
  function invadeProtegida(x: number, y: number, escala: number, quais: number[], vel: number) {
    const deriva = (vel * DURACAO_MAXIMA) / 1000 + MARGEM;
    // caixa dos arcos escolhidos, com folga para a rotação (±0,35 rad) e a deriva
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of quais) {
      const c = ARCOS[q].caixa;
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[2]); y1 = Math.max(y1, c[3]);
    }
    const folgaGiro = 0.12 * escala;
    const caixa = {
      x0: x + x0 * escala - folgaGiro - deriva,
      y0: y + y0 * escala - folgaGiro - deriva,
      x1: x + x1 * escala + folgaGiro + deriva,
      y1: y + y1 * escala + folgaGiro + deriva,
    };
    return amb.protegidas.some((p) => caixa.x0 < p.x1 && caixa.x1 > p.x0 && caixa.y0 < p.y1 && caixa.y1 > p.y0);
  }

  /** Cria um grupo: um arco solto ou os três arcos juntos (como no símbolo).
   *  Sorteia posições até achar uma que não passe por cima do logo/título. */
  function novoGrupo(agora: number, jaPronto: boolean) {
    const { largura: L, altura: A } = amb;
    const base = Math.min(L, A);
    const juntos = Math.random() < (sutil ? 0.35 : 0.4);
    const quais = juntos ? [0, 1, 2] : [Math.floor(Math.random() * 3)];
    const vel = sutil ? entre(1, 2.5) : entre(1, 3);
    let x = 0, y = 0, escala = 0, achou = false;
    for (let tentativa = 0; tentativa < 30 && !achou; tentativa++) {
      x = sutil ? entre(L * 0.55, L * 1.05) : entre(L * 0.2, L * 1.1);
      y = sutil ? entre(A * 0.05, A * 0.55) : entre(-A * 0.05, A * 1.05);
      escala = sutil ? entre(A * 0.7, A * 1.2) : juntos ? entre(base * 0.42, base * 0.8) : entre(base * 0.45, base * 0.95);
      achou = !invadeProtegida(x, y, escala, quais, vel);
    }
    if (!achou) return false; // sem lugar livre agora; tenta de novo mais tarde
    const giro = entre(-0.35, 0.35);
    const direcao = entre(0, Math.PI * 2);
    const { cor, alfa } = cores();
    const desenho = entre(5200, 8200);
    const vida = entre(9000, 16000);
    const some = entre(3000, 4500);
    const inicio = jaPronto ? agora - desenho - entre(0, vida * 0.6) : agora;
    const grupo = ++numeroDoGrupo;
    quais.forEach((forma, k) =>
      lista.push({
        grupo,
        forma,
        x,
        y,
        escala,
        giro,
        vx: Math.cos(direcao) * vel,
        vy: Math.sin(direcao) * vel,
        vgiro: entre(-0.012, 0.012),
        cor,
        alfa,
        nasce: inicio + (jaPronto ? 0 : k * 900), // os três se desenham um depois do outro
        desenho,
        vida,
        some,
      }),
    );
    return true;
  }

  function desenhar(a: Arco, t: number) {
    const idade = t - a.nasce;
    if (idade < 0) return;
    const progresso = suave(idade / a.desenho); // 0 → 1 enquanto se desenha
    const fim = a.desenho + a.vida;
    const saida = idade > fim ? 1 - suave((idade - fim) / a.some) : 1;
    const alfa = a.alfa * saida * (0.35 + 0.65 * progresso);
    if (alfa <= 0.003) return;

    const s = idade / 1000;
    const caixa = ARCOS[a.forma].caixa;
    ctx.save();
    ctx.translate(a.x + a.vx * s, a.y + a.vy * s);
    ctx.rotate(a.giro + a.vgiro * s);
    ctx.scale(a.escala, a.escala);

    if (progresso < 1) {
      // "se desenhar": mostra o arco da base (embaixo à esquerda) até a ponta (em cima à direita)
      const [x0, y0, x1, y1] = caixa;
      const dx = x1 - x0;
      const dy = y0 - y1;
      const comprimento = Math.hypot(dx, dy);
      ctx.save();
      ctx.translate(x0, y1);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath();
      ctx.rect(-0.05, -comprimento, progresso * (comprimento + 0.05) + 0.001, comprimento * 2);
      ctx.restore();
      ctx.clip();
    }
    ctx.globalAlpha = alfa;
    ctx.fillStyle = a.cor;
    ctx.fill(formas[a.forma]);
    ctx.restore();
  }

  return {
    resolucaoMaxima: 1.5, // formas suaves: não precisam de resolução "retina"

    redimensionar() {
      recomecar = true;
    },

    quadro(t) {
      const { largura: L, altura: A } = amb;
      if (recomecar) {
        // começa com a tela já composta se estiver parado; senão, os arcos vão surgindo
        lista = [];
        for (let i = 0; i < alvo(); i++) {
          if (amb.parado) novoGrupo(t, true);
          else novoGrupo(t + i * 2600 - 2600, false);
        }
        // (novoGrupo pode desistir se não houver lugar livre; os que faltarem nascem depois)
        proximo = t + entre(3000, 6000);
        recomecar = false;
      }

      // tira os que já sumiram; faz nascer novos para manter a quantidade
      lista = lista.filter((a) => t - a.nasce < a.desenho + a.vida + a.some);
      const grupos = new Set(lista.map((a) => a.grupo)).size;
      if (!amb.parado && t >= proximo && grupos < alvo()) {
        proximo = t + (novoGrupo(t, false) ? entre(4500, 8000) : 1500);
      }

      ctx.clearRect(0, 0, L, A);
      for (const a of lista) desenhar(a, t);
      ctx.globalAlpha = 1;
    },
  };
};
