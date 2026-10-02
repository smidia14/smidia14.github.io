// ARTE DOS ARCOS — feita com os arcos curvos do símbolo da SMI
// (o "elemento desprendido" da Trama 2, manual seção 6).
//
// Os arcos aparecem sempre em trios, na posição exata do símbolo (como as velas, linhas
// paralelas que nunca se cruzam). Cada arco se desenha devagar (da base até a ponta),
// fica um tempo e some.
//
// Para que nunca se cruzem nem se amontoem:
//  - todos os trios têm a MESMA orientação (ficam paralelos entre si);
//  - todos ficam num mesmo "plano" que desliza e balança devagar como um bloco só:
//    a distância entre eles nunca muda depois que nascem;
//  - um trio novo só nasce se ficar a uma distância mínima de todos os outros.
// O logo NÃO é animado e nenhum arco passa por cima dele (área protegida).
// Os arcos podem passar por trás do texto do título, mas ali ficam com só 30% da
// opacidade (área atenuada), para o texto manter contraste de pelo menos 4,5 : 1.
import { entre, type FabricaDeCena } from "./motor";
import { ARCOS } from "./arcos-do-simbolo";

interface Trio {
  x: number; // centro do símbolo, no "plano" dos arcos (px)
  y: number;
  escala: number; // altura do símbolo, em px
  cores: { cor: string; alfa: number }[]; // uma por arco
  nasce: number; // quando o primeiro arco começa a se desenhar (ms)
  desenho: number; // duração do "se desenhar" de cada arco (ms)
  vida: number; // quanto tempo fica inteiro (ms)
  some: number; // duração do sumiço (ms)
}

// Opacidade que sobra aos arcos atrás do texto. Pior caso medido (arco branco sobre o centro
// do halo verde): até 33% da opacidade normal o título ainda tem 4,6 : 1. Usamos 30%.
const FATOR_ATRAS_DO_TEXTO = 0.3;
// Atrás de texto pequeno ou dourado (data-arte-atenua="forte"), apaga mais: fica 12%.
const FATOR_ATRAS_DO_TEXTO_FORTE = 0.12;

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ATRASO_ENTRE_ARCOS = 900; // os três arcos se desenham um depois do outro (ms)
const DURACAO_MAXIMA = 8200 + 2 * ATRASO_ENTRE_ARCOS + 16000 + 4500;

// caixa que contém os três arcos juntos (coordenadas do símbolo: altura = 1)
const CAIXA_TRIO = ARCOS.reduce(
  (c, a) => [Math.min(c[0], a.caixa[0]), Math.min(c[1], a.caixa[1]), Math.max(c[2], a.caixa[2]), Math.max(c[3], a.caixa[3])],
  [Infinity, Infinity, -Infinity, -Infinity],
);

export const arcos: FabricaDeCena = (ctx, amb) => {
  const sutil = amb.modo === "sutil";
  const formas = ARCOS.map((a) => new Path2D(a.d));
  let trios: Trio[] = [];
  let recomecar = true;
  let proximo = 0;

  // O "plano" dos arcos: todos com a mesma orientação, deslizando e balançando juntos
  const orientacao = entre(-0.3, 0.25); // rotação comum a todos os trios (rad)
  const direcao = entre(Math.PI * 0.9, Math.PI * 1.3); // desliza devagar (para a esquerda, com leve subida/descida)
  const velocidade = sutil ? 1.2 : 2.2; // px/s
  const plano = (t: number) => ({
    dx: (Math.cos(direcao) * velocidade * t) / 1000,
    dy: (Math.sin(direcao) * velocidade * t) / 1000,
    balanco: Math.sin((t / 90000) * Math.PI * 2) * 0.05, // balanço lento: ±0,05 rad a cada 90 s
  });

  // quantos trios ao mesmo tempo (menos no celular; nas páginas internas, bem pouco)
  const alvo = () => (sutil ? (amb.leve ? 1 : 2) : amb.leve ? 3 : 4);

  // Máscara das áreas atenuadas (atrás do texto): feita em baixa resolução e ampliada,
  // o que deixa as bordas suaves (sem "corte" visível no meio de um arco).
  let mascara: HTMLCanvasElement | null = null;
  function montarMascara() {
    if (!amb.atenuadas.length || !amb.largura) {
      mascara = null;
      return;
    }
    const escala = 1 / 12;
    const folga = 18; // px em volta de cada linha de texto
    mascara = document.createElement("canvas");
    mascara.width = Math.ceil(amb.largura * escala);
    mascara.height = Math.ceil(amb.altura * escala);
    const m = mascara.getContext("2d")!;
    for (const z of amb.atenuadas) {
      m.fillStyle = `rgba(0,0,0,${1 - (z.forte ? FATOR_ATRAS_DO_TEXTO_FORTE : FATOR_ATRAS_DO_TEXTO)})`;
      m.fillRect((z.x0 - folga) * escala, (z.y0 - folga) * escala, (z.x1 - z.x0 + 2 * folga) * escala, (z.y1 - z.y0 + 2 * folga) * escala);
    }
  }

  function cores() {
    return [0, 1, 2].map(() => {
      const r = Math.random();
      // páginas internas: faixa azul do topo, versão bem mais discreta que a da página inicial
      if (sutil) {
        if (r < 0.1) return { cor: amb.cor("dourado"), alfa: entre(0.28, 0.36) };
        if (r < 0.55) return { cor: amb.cor("branco"), alfa: entre(0.07, 0.12) };
        return { cor: amb.cor("azul-claro"), alfa: entre(0.1, 0.16) };
      }
      if (r < 0.1) return { cor: amb.cor("dourado"), alfa: entre(0.45, 0.6) }; // toque raro
      if (r < 0.55) return { cor: amb.cor("branco"), alfa: entre(0.14, 0.24) };
      return { cor: amb.cor("azul-claro"), alfa: entre(0.22, 0.34) };
    });
  }

  /** Ponto do "plano" dos arcos → ponto na tela, no momento t. */
  function naTela(x: number, y: number, t: number) {
    const { dx, dy, balanco } = plano(t);
    const cx = amb.largura / 2;
    const cy = amb.altura / 2;
    const c = Math.cos(balanco);
    const s = Math.sin(balanco);
    return { x: cx + (x - cx) * c - (y - cy) * s + dx, y: cy + (x - cx) * s + (y - cy) * c + dy, giro: balanco };
  }

  /** Ponto na tela → ponto do "plano", no momento t (para escolher onde nasce um trio). */
  function noPlano(x: number, y: number, t: number) {
    const { dx, dy, balanco } = plano(t);
    const cx = amb.largura / 2;
    const cy = amb.altura / 2;
    const px = x - dx - cx;
    const py = y - dy - cy;
    const c = Math.cos(-balanco);
    const s = Math.sin(-balanco);
    return { x: cx + px * c - py * s, y: cy + px * s + py * c };
  }

  /** Caixa (na tela) de um trio centrado em (x, y) com rotação 'giro'. */
  function caixaNaTela(x: number, y: number, escala: number, giro: number) {
    const [a0, b0, a1, b1] = CAIXA_TRIO;
    const c = Math.cos(giro);
    const s = Math.sin(giro);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [px, py] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) {
      xs.push(x + (px * c - py * s) * escala);
      ys.push(y + (px * s + py * c) * escala);
    }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  /** Durante toda a vida do trio, ele passaria perto do logo/título? */
  function invadeProtegida(x: number, y: number, escala: number, inicio: number) {
    const margem = 28;
    for (let dt = 0; dt <= DURACAO_MAXIMA; dt += 1000) {
      const p = naTela(x, y, inicio + dt);
      const cx = caixaNaTela(p.x, p.y, escala, orientacao + p.giro);
      const bate = amb.protegidas.some(
        (z) => cx.x0 < z.x1 + margem && cx.x1 > z.x0 - margem && cx.y0 < z.y1 + margem && cx.y1 > z.y0 - margem,
      );
      if (bate) return true;
    }
    return false;
  }

  /** Fica a menos da distância mínima de algum trio que ainda está na tela?
   *  (Todos têm a mesma orientação e se movem juntos, então basta comparar agora.) */
  function pertoDeOutro(x: number, y: number, escala: number) {
    const minha = caixaNaTela(x, y, escala, orientacao);
    return trios.some((o) => {
      const dele = caixaNaTela(o.x, o.y, o.escala, orientacao);
      const folga = Math.max(32, 0.08 * Math.max(escala, o.escala)); // espaçamento mínimo entre trios
      return minha.x0 < dele.x1 + folga && minha.x1 > dele.x0 - folga && minha.y0 < dele.y1 + folga && minha.y1 > dele.y0 - folga;
    });
  }

  /** Tenta criar um trio num lugar livre. Devolve false se não houver lugar agora. */
  function novoTrio(agora: number, jaPronto: boolean) {
    const { largura: L, altura: A } = amb;
    const base = Math.min(L, A);
    const desenho = entre(5200, 8200);
    const vida = entre(10000, 16000);
    const some = entre(3000, 4500);
    const inicio = jaPronto ? agora - desenho - 2 * ATRASO_ENTRE_ARCOS - entre(0, vida * 0.6) : agora;
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const telaX = sutil ? entre(L * 0.3, L * 1.05) : entre(-L * 0.05, L * 1.08);
      const telaY = sutil ? entre(A * 0.1, A * 0.9) : entre(A * 0.05, A * 0.95);
      const escala = sutil ? entre(A * 0.55, A * 0.95) : entre(base * 0.38, base * 0.72);
      const p = noPlano(telaX, telaY, inicio);
      if (pertoDeOutro(p.x, p.y, escala) || invadeProtegida(p.x, p.y, escala, inicio)) continue;
      trios.push({ x: p.x, y: p.y, escala, cores: cores(), nasce: inicio, desenho, vida, some });
      return true;
    }
    return false;
  }

  function desenharArco(tr: Trio, forma: number, t: number) {
    const idade = t - tr.nasce - forma * ATRASO_ENTRE_ARCOS;
    if (idade < 0) return;
    const progresso = suave(idade / tr.desenho); // 0 → 1 enquanto se desenha
    const fim = tr.desenho + (2 - forma) * ATRASO_ENTRE_ARCOS + tr.vida; // os três somem juntos
    const saida = idade > fim ? 1 - suave((idade - fim) / tr.some) : 1;
    const { cor, alfa: alfaMax } = tr.cores[forma];
    const alfa = alfaMax * saida * (0.35 + 0.65 * progresso);
    if (alfa <= 0.003) return;

    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(orientacao);
    ctx.scale(tr.escala, tr.escala);
    if (progresso < 1) {
      // "se desenhar": mostra o arco da base (embaixo à esquerda) até a ponta (em cima à direita)
      const [x0, y0, x1, y1] = ARCOS[forma].caixa;
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
    ctx.fillStyle = cor;
    ctx.fill(formas[forma]);
    ctx.restore();
  }

  return {
    resolucaoMaxima: 1.5, // formas suaves: não precisam de resolução "retina"

    redimensionar() {
      recomecar = true;
      montarMascara();
    },

    areasMudaram() {
      montarMascara();
    },

    quadro(t) {
      const { largura: L, altura: A } = amb;
      if (recomecar) {
        // parado ("reduzir movimento"): começa com a tela já composta; senão, os trios vão surgindo
        trios = [];
        for (let i = 0; i < alvo(); i++) novoTrio(amb.parado ? t : t - 2600 + i * 3500, amb.parado);
        proximo = t + entre(3000, 6000);
        recomecar = false;
      }

      // tira os que já sumiram; faz nascer novos para manter a quantidade
      trios = trios.filter((tr) => t - tr.nasce < tr.desenho + 2 * ATRASO_ENTRE_ARCOS + tr.vida + tr.some);
      if (!amb.parado && t >= proximo && trios.length < alvo()) {
        proximo = t + (novoTrio(t, false) ? entre(5000, 9000) : 1500);
      }

      ctx.clearRect(0, 0, L, A);
      // move o "plano" inteiro: todos os trios juntos, sem mudar a distância entre eles
      const { dx, dy, balanco } = plano(t);
      ctx.save();
      ctx.translate(L / 2 + dx, A / 2 + dy);
      ctx.rotate(balanco);
      ctx.translate(-L / 2, -A / 2);
      for (const tr of trios) for (let forma = 0; forma < 3; forma++) desenharArco(tr, forma, t);
      ctx.restore();
      ctx.globalAlpha = 1;

      // atrás do texto: apaga 70% do que foi desenhado (fica 30%), com bordas suaves
      if (mascara) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-out";
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mascara, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }
    },
  };
};
