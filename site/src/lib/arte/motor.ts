// Parte comum das artes animadas: tamanho, laço de animação, pausas,
// "reduzir movimento", versão leve no celular, mouse e rolagem.
// A cena (arcos.ts) só desenha; este arquivo decide quando e em que tamanho.

export type Modo = "forte" | "sutil"; // forte: topo da página inicial; sutil: topo das páginas internas

export interface Ambiente {
  modo: Modo;
  leve: boolean; // celular/tela pequena: menos elementos
  parado: boolean; // "reduzir movimento" ativado: a cena deve montar uma imagem completa e parada
  largura: number;
  altura: number;
  /** Cor do tema (src/styles/tema.css) com transparência: cor("dourado", 0.5) */
  cor: (nome: string, alfa?: number) => string;
  /** Posição do mouse sobre a arte (ativo = mouse presente) */
  ponteiro: { x: number; y: number; ativo: boolean };
  /** Quanto a página já rolou, em pixels */
  rolagem: () => number;
  /** Áreas onde a arte não deve passar (logo, título), em px relativos ao canvas.
   *  Vêm dos elementos marcados com o atributo data-arte-protege. Em elementos de texto,
   *  cada LINHA vira uma área (e não a caixa inteira, que pode ser bem mais larga que o texto). */
  protegidas: Area[];
  /** Áreas onde os arcos PODEM passar, mas bem mais apagados (atrás do texto do título),
   *  para o texto manter contraste. Vêm dos elementos com data-arte-atenua. */
  atenuadas: Area[];
}

export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  forte?: boolean; // data-arte-atenua="forte": apaga ainda mais (texto pequeno ou dourado)
}

export interface Cena {
  /** Resolução máxima (1 = normal, 2 = telas "retina"). Formas suaves ficam bem com menos, e pesam bem menos. */
  resolucaoMaxima?: number;
  /** Chamado quando o tamanho muda (e na primeira vez) */
  redimensionar(): void;
  /** Chamado quando as áreas protegidas/atenuadas mudam de lugar (fontes carregadas, fim da entrada do título) */
  areasMudaram?(): void;
  /** Desenha um quadro. t = tempo em ms; dt = ms desde o último quadro (0 = imagem parada) */
  quadro(t: number, dt: number): void;
}

export type FabricaDeCena = (ctx: CanvasRenderingContext2D, amb: Ambiente) => Cena;

const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");
const telaPequena = window.matchMedia("(max-width: 767px), (pointer: coarse)");

function lerCores() {
  const estilo = getComputedStyle(document.documentElement);
  const cache = new Map<string, [number, number, number]>();
  return (nome: string, alfa = 1) => {
    let rgb = cache.get(nome);
    if (!rgb) {
      const hex = estilo.getPropertyValue(`--color-${nome}`).trim().replace("#", "") || "888888";
      const h = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
      rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
      cache.set(nome, rgb);
    }
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alfa})`;
  };
}

export function iniciarArte(canvas: HTMLCanvasElement, modo: Modo, fabrica: FabricaDeCena) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const amb: Ambiente = {
    modo,
    leve: telaPequena.matches,
    parado: movimentoReduzido.matches,
    largura: 0,
    altura: 0,
    cor: lerCores(),
    ponteiro: { x: -9999, y: -9999, ativo: false },
    rolagem: () => window.scrollY,
    protegidas: [],
    atenuadas: [],
  };
  const cena = fabrica(ctx, amb);

  let tempo = 20000 + Math.random() * 20000; // começa num momento "já em movimento"
  let visivel = false;
  let rodando = false;
  let ultimo = 0;

  function ajustarTamanho() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // resolução: suficiente para ficar nítido, sem pesar em telas muito densas
    const limite = modo === "sutil" ? 1 : Math.min(cena.resolucaoMaxima ?? 2, amb.leve ? 1.5 : 2);
    const dpr = Math.min(window.devicePixelRatio || 1, limite);
    amb.largura = r.width;
    amb.altura = r.height;
    amb.leve = telaPequena.matches;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    medirAreas();
    cena.redimensionar();
    return true;
  }

  /** Mede as áreas (em px relativos ao canvas). Em elementos de texto, cada LINHA vira uma
   *  área (e não a caixa inteira, que pode ser bem mais larga que o texto). */
  function medirAreas() {
    const r = canvas.getBoundingClientRect();
    const medir = (seletor: string): Area[] =>
      [...(canvas.parentElement?.querySelectorAll(seletor) ?? [])].flatMap((el) => {
        if (getComputedStyle(el).display === "none") return [];
        let caixas: DOMRect[] = [el.getBoundingClientRect()];
        if (el.children.length === 0 && el.textContent?.trim()) {
          const faixa = document.createRange();
          faixa.selectNodeContents(el);
          caixas = [...faixa.getClientRects()].filter((c) => c.width > 0);
        }
        const forte = (el as HTMLElement).dataset.arteAtenua === "forte";
        return caixas.map((p) => ({ x0: p.left - r.left, y0: p.top - r.top, x1: p.right - r.left, y1: p.bottom - r.top, forte }));
      });
    amb.protegidas = medir("[data-arte-protege]");
    amb.atenuadas = medir("[data-arte-atenua]");
  }

  function remedir() {
    if (!amb.largura) return;
    medirAreas();
    cena.areasMudaram?.();
    if (!rodando) imagemParada();
  }
  // o texto muda de lugar quando as fontes terminam de carregar e quando a entrada do título acaba
  document.fonts?.ready.then(remedir);
  canvas.parentElement?.addEventListener("animationend", remedir);
  canvas.parentElement?.addEventListener("transitionend", remedir);

  function quadro(agora: number) {
    if (!rodando) return;
    const dt = ultimo ? Math.min(50, agora - ultimo) : 16; // evita saltos depois de pausas
    ultimo = agora;
    tempo += dt;
    cena.quadro(tempo, dt);
    requestAnimationFrame(quadro);
  }

  function imagemParada() {
    if (amb.largura) cena.quadro(tempo, 0);
  }

  // Decide se anima, fica parado ou pausa
  function atualizar() {
    const deveRodar = visivel && !document.hidden && !movimentoReduzido.matches;
    // a página pode ter aberto sem tamanho (aba em segundo plano): ajusta antes de animar
    if (deveRodar && !amb.largura) ajustarTamanho();
    if (deveRodar && !rodando) {
      rodando = true;
      ultimo = 0;
      requestAnimationFrame(quadro);
    } else if (!deveRodar) {
      rodando = false;
    }
  }

  if (ajustarTamanho()) imagemParada(); // primeira imagem aparece na hora

  new IntersectionObserver(([e]) => {
    visivel = e.isIntersecting;
    atualizar();
  }).observe(canvas);
  document.addEventListener("visibilitychange", atualizar);
  movimentoReduzido.addEventListener("change", () => {
    amb.parado = movimentoReduzido.matches;
    cena.redimensionar();
    atualizar();
    imagemParada();
  });

  // Mouse (só no computador; no celular as cenas reagem à rolagem)
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      amb.ponteiro.x = e.clientX - r.left;
      amb.ponteiro.y = e.clientY - r.top;
      amb.ponteiro.ativo = amb.ponteiro.y >= 0 && amb.ponteiro.y <= r.height;
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => (amb.ponteiro.ativo = false));

  let espera: number | undefined;
  let medidas = [canvas.clientWidth, canvas.clientHeight];
  const aoMudarTamanho = () => {
    // no celular a barra do navegador muda um pouco a altura ao rolar: ignora mudanças pequenas
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    if (Math.abs(w - medidas[0]) < 2 && Math.abs(h - medidas[1]) < 120) return;
    medidas = [w, h];
    clearTimeout(espera);
    espera = window.setTimeout(() => {
      if (ajustarTamanho()) imagemParada();
    }, 150);
  };
  new ResizeObserver(aoMudarTamanho).observe(canvas);
  window.addEventListener("resize", aoMudarTamanho, { passive: true });
}

/** Número aleatório entre a e b */
export const entre = (a: number, b: number) => a + Math.random() * (b - a);
