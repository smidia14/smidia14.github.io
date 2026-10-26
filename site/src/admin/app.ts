// ÁREA DA EQUIPE — telas e funcionamento do painel (/admin/).
//
// Login e dados pelo Firebase (src/admin/nuvem.ts). O que a equipe salva vai para o banco do
// Firebase, e o GitHub atualiza o site em até ~15 minutos.
// Sem a configuração do Firebase (firebase-config.ts vazio), funciona em MODO DEMONSTRAÇÃO:
// qualquer e-mail entra e as alterações ficam só neste navegador.
import { GRUPOS, ESCOLA_SABATINA, nomeDaSecao, grupoDaSecao } from "./secoes";
import * as nuvem from "./nuvem";
import { EMAIL_DONO } from "./firebase-config";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Material {
  slug: string;
  titulo: string;
  secao: string | null;
  ano: string;
  semestre: string;
  publico: "adulto" | "infantil";
  origem: string;
  linkDrive: string;
  capaModo: "primeira-pagina" | "padrao" | "imagem";
  capaImagem?: string;
  linkOficial?: string;
  observacao?: string;
  esconder?: boolean;
}
interface Capa {
  legenda: string;
  imagem: string;
  link: string;
}
interface Dados {
  materiais: Material[];
  contatos: {
    _leia?: string;
    escritorio: { titulo: string; endereco: string; telefone: string };
    emails: string[];
    redes: { youtube: string; instagram: string; facebook: string; whatsapp: string };
  };
  inicio: {
    _leia?: string;
    acessoRapido: string[];
    literaturas: { titulo: string; capas: Capa[] };
    livrosDiversos: { titulo: string; capas: Capa[] };
    transmissoes: { titulo: string; imagem: string; link: string };
    departamentos: { titulo: string; itens: { nome: string; imagem: string; link: string }[] };
  };
  livraria: { _leia?: string; livros: { titulo: string; capa: string }[]; comoComprar: string };
}
type Iniciais = Dados & { processados: Record<string, { capa?: string }>; paginas: { titulo: string; href: string }[] };

// ---------------------------------------------------------------------------
// DADOS
// ---------------------------------------------------------------------------
const iniciais: Iniciais = JSON.parse(document.getElementById("dados-iniciais")!.textContent!);
const DEMO = !nuvem.configurado;
const CHAVE_DADOS = "smi-painel-demo-dados";
const CHAVE_USUARIO = "smi-painel-demo-usuario";

const copiaDoSite = (): Dados => {
  const { materiais, contatos, inicio, livraria } = structuredClone(iniciais);
  return { materiais, contatos, inicio, livraria };
};
function carregarDemo(): Dados {
  try {
    const salvo = localStorage.getItem(CHAVE_DADOS);
    if (salvo) return JSON.parse(salvo);
  } catch {
    /* sem armazenamento: usa os dados do site */
  }
  return copiaDoSite();
}
let dados: Dados = DEMO ? carregarDemo() : copiaDoSite();

// quem está usando o painel
type Situacao = nuvem.Situacao | { tipo: "carregando" };
let situacao: Situacao = { tipo: "carregando" };
let dadosProntos = DEMO;
let modoEntrar: "entrar" | "primeiro-acesso" = "entrar";

if (DEMO) {
  let email: string | null = null;
  try {
    email = sessionStorage.getItem(CHAVE_USUARIO);
  } catch {
    /* ignora */
  }
  situacao = email ? { tipo: "dentro", email, dono: true } : { tipo: "fora" };
} else {
  nuvem.acompanharLogin(async (s) => {
    situacao = s;
    dadosProntos = false;
    desenhar();
    if (s.tipo === "dentro") await carregarDaNuvem(s.dono);
  });
}

const tirarControle = <T extends object>(o: T) => {
  const { alteradoEm: _a, ...resto } = o as T & { alteradoEm?: unknown };
  return resto as T;
};

async function carregarDaNuvem(dono: boolean) {
  try {
    const lido = await nuvem.lerTudo();
    if (lido) {
      dados = {
        materiais: lido.materiais.map((m) => tirarControle(m) as unknown as Material),
        contatos: tirarControle(lido.contatos as object) as Dados["contatos"],
        inicio: tirarControle(lido.inicio as object) as Dados["inicio"],
        livraria: tirarControle(lido.livraria as object) as Dados["livraria"],
      };
    } else if (dono) {
      // primeira vez: o banco está vazio; copia para ele o que já está no site
      raiz.innerHTML = `<p class="painel-carregando">Preparando o painel pela primeira vez…</p>`;
      dados = copiaDoSite();
      await nuvem.preencherPrimeiraVez(dados as unknown as nuvem.DadosNuvem);
      avisar("Painel preparado! Os dados do site foram copiados para o painel.");
    } else {
      avisar("O painel ainda não foi preparado. Peça para a responsável entrar primeiro.", "erro");
    }
    dadosProntos = true;
  } catch (erro) {
    avisar(nuvem.mensagemDeErro(erro), "erro");
  }
  desenhar();
}

function usuarioAtual(): string | null {
  return situacao.tipo === "dentro" ? situacao.email : null;
}
const ehDono = () => situacao.tipo === "dentro" && situacao.dono && !DEMO;

/** O que foi alterado (para gravar só aquilo no banco). */
type Alvo = { material: string } | { apagar: string } | { site: "contatos" | "inicio" | "livraria" };

async function salvar(mensagem: string, alvo: Alvo): Promise<boolean> {
  if (DEMO) {
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
    } catch {
      /* ignora */
    }
    avisar(`${mensagem} <span class="painel-aviso-nota">(demonstração: ainda não vai para o site)</span>`);
    return true;
  }
  try {
    if ("material" in alvo) {
      const m = dados.materiais.find((x) => x.slug === alvo.material)!;
      await nuvem.gravarMaterial(m as unknown as { slug: string } & Record<string, unknown>);
    } else if ("apagar" in alvo) await nuvem.apagarMaterial(alvo.apagar);
    else await nuvem.gravarSite(alvo.site, dados[alvo.site]);
    avisar(`${mensagem} <span class="painel-aviso-nota">Aparece no site em até 15 minutos.</span>`);
    return true;
  } catch (erro) {
    avisar(nuvem.mensagemDeErro(erro), "erro");
    return false;
  }
}

/** Guarda uma imagem escolhida no computador e devolve o valor para o campo. */
async function guardarImagem(dataUrl: string) {
  return DEMO ? dataUrl : nuvem.guardarImagem(dataUrl);
}
/** Endereço para mostrar uma imagem na tela (as enviadas pelo painel vêm do banco). */
const img = (valor: string | undefined) => (DEMO || !valor ? valor ?? "" : nuvem.enderecoDaImagem(valor, () => desenhar()));

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const raiz = document.getElementById("painel")!;
const caixaAviso = document.getElementById("aviso")!;

/** Escapa texto para colocar dentro do HTML. */
const e = (t: unknown) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let temporizadorAviso = 0;
function avisar(html: string, tipo: "ok" | "erro" = "ok") {
  caixaAviso.innerHTML = html;
  caixaAviso.dataset.tipo = tipo;
  caixaAviso.classList.add("visivel");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => caixaAviso.classList.remove("visivel"), 4500);
}

function idDoDrive(link: string) {
  return link.match(/\/d\/([\w-]{10,})/)?.[1] ?? link.match(/[?&]id=([\w-]{10,})/)?.[1] ?? null;
}
const miniaturaDrive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w480`;

function slugificar(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

/** Capa azul padrão (mesma do site). */
function capaPadrao(titulo: string, ano?: string) {
  return `<span class="capa-padrao"><span class="capa-padrao-miolo">
    <img src="/marca/simbolo-branco.svg" alt="" class="capa-padrao-simbolo" width="250" height="268" />
    <span class="capa-padrao-titulo">${e(titulo || "Título")}</span>
    ${ano ? `<span class="capa-padrao-ano">${e(ano)}</span>` : ""}
  </span></span>`;
}

/** Imagem da capa de um material, do jeito que vai aparecer no site. */
function capaDoMaterial(m: Pick<Material, "titulo" | "ano" | "linkDrive" | "capaModo" | "capaImagem">) {
  const id = idDoDrive(m.linkDrive);
  if (m.capaModo === "imagem" && m.capaImagem) return `<img src="${e(img(m.capaImagem))}" alt="" />`;
  if (m.capaModo === "primeira-pagina" && id) {
    const pronta = iniciais.processados[id]?.capa;
    return `<img src="${e(pronta ?? miniaturaDrive(id))}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  }
  return capaPadrao(m.titulo, m.ano);
}

/** Lê uma imagem escolhida no computador e devolve uma versão leve (WebP, até 600 px). */
function imagemLeve(arquivo: File, largura = 600): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, largura / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/webp", 0.8));
    };
    img.onerror = () => falha(new Error("Não consegui abrir essa imagem."));
    img.src = URL.createObjectURL(arquivo);
  });
}

// Ícones simples (traço), no lugar de emojis
const ICONES: Record<string, string> = {
  nova: '<path d="M12 5v14M5 12h14"/>',
  livros: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="M8 7h8"/>',
  contato: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  casa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  vitrine: '<path d="M3 5h18v14H3z"/><path d="M8 5v14M16 5v14"/>',
  voltar: '<path d="M15 18 9 12l6-6"/>',
  sair: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  site: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v6H4V6h6"/>',
  lixo: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  esquerda: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  direita: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  ok: '<path d="m5 12 5 5 9-10"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  olho: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icone = (nome: string) =>
  `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;

// ---------------------------------------------------------------------------
// Moldura (barra de cima) e navegação
// ---------------------------------------------------------------------------
function moldura(conteudo: string, voltar?: { href: string; texto: string }) {
  return `
  <header class="painel-topo">
    <a href="#/" class="painel-marca">
      <img src="/marca/smi-horizontal-branco.svg" alt="SMI" width="96" height="32" />
      <span>Área da equipe</span>
    </a>
    <nav class="painel-topo-acoes">
      <a href="/" target="_blank" rel="noopener" class="painel-topo-link">${icone("site")}<span>Ver o site</span></a>
      <button type="button" data-acao="sair" class="painel-topo-link">${icone("sair")}<span>Sair</span></button>
    </nav>
  </header>
  ${DEMO ? `<div class="painel-faixa-demo">Demonstração: as alterações ficam só neste navegador e <strong>não</strong> vão para o site.</div>` : ""}
  <main class="painel-conteudo">
    ${voltar ? `<a href="${voltar.href}" class="painel-voltar">${icone("voltar")} ${e(voltar.texto)}</a>` : ""}
    ${conteudo}
  </main>`;
}

function rota() {
  return location.hash.replace(/^#\/?/, "");
}

function desenhar() {
  if (situacao.tipo === "carregando") {
    raiz.innerHTML = `<p class="painel-carregando">Carregando…</p>`;
    return;
  }
  if (situacao.tipo === "fora") {
    raiz.innerHTML = telaEntrar();
    raiz.querySelector<HTMLElement>("[data-foco]")?.focus();
    return;
  }
  if (situacao.tipo === "sem-verificar" || situacao.tipo === "sem-permissao") {
    raiz.innerHTML = telaAviso(situacao);
    return;
  }
  if (!dadosProntos) {
    raiz.innerHTML = `<p class="painel-carregando">Carregando os dados do site…</p>`;
    return;
  }
  const r = rota();
  if (r === "") raiz.innerHTML = telaInicio();
  else if (r === "nova") raiz.innerHTML = telaNova();
  else if (r === "materiais") raiz.innerHTML = telaMateriais();
  else if (r.startsWith("material/")) raiz.innerHTML = telaMaterial(decodeURIComponent(r.slice(9)));
  else if (r === "contatos") raiz.innerHTML = telaContatos();
  else if (r === "pagina-inicial") raiz.innerHTML = telaPaginaInicial();
  else if (r === "livros") raiz.innerHTML = telaLivros();
  else if (r === "equipe" && ehDono()) raiz.innerHTML = telaEquipe();
  else location.hash = "#/";
  raiz.querySelector<HTMLElement>("[data-foco]")?.focus();
}

// ---------------------------------------------------------------------------
// Tela: Entrar
// ---------------------------------------------------------------------------
function telaEntrar() {
  const primeiro = modoEntrar === "primeiro-acesso";
  return `
  <div class="entrar">
    <form class="entrar-cartao" data-form="entrar">
      <img src="/marca/smi-vertical-azul.svg" alt="SMI" class="entrar-logo" width="120" height="120" />
      <h1>Área da equipe</h1>
      <p class="entrar-sub">${primeiro ? "Primeiro acesso: crie a sua senha." : "Entre para atualizar o site."}</p>
      ${
        !primeiro && !DEMO
          ? `<button type="button" class="botao botao-claro botao-google" data-acao="google">
              <svg viewBox="0 0 24 24" class="icone" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"/></svg>
              Entrar com Google
            </button>
            <p class="entrar-ou"><span>ou com e-mail e senha</span></p>`
          : ""
      }
      <label class="campo">
        <span>E-mail</span>
        <input type="email" name="email" required autocomplete="username" data-foco />
      </label>
      <label class="campo">
        <span>${primeiro ? "Crie uma senha (pelo menos 6 letras ou números)" : "Senha"}</span>
        <input type="password" name="senha" required minlength="6" autocomplete="${primeiro ? "new-password" : "current-password"}" />
      </label>
      <button type="submit" class="botao botao-grande">${primeiro ? "Criar senha" : "Entrar"}</button>
      ${
        primeiro
          ? `<button type="button" class="link-simples" data-acao="modo-entrar">Já tenho senha</button>`
          : `<div class="entrar-links">
              <button type="button" class="link-simples" data-acao="esqueci">Esqueci minha senha</button>
              ${DEMO ? "" : `<button type="button" class="link-simples" data-acao="modo-primeiro">Primeiro acesso</button>`}
            </div>`
      }
      ${DEMO ? `<p class="entrar-demo">Demonstração: qualquer e-mail e senha entram.</p>` : ""}
    </form>
  </div>`;
}

/** E-mail ainda não confirmado, ou pessoa que não está na equipe. */
function telaAviso(s: { tipo: "sem-verificar" | "sem-permissao"; email: string }) {
  const verificar = s.tipo === "sem-verificar";
  return `
  <div class="entrar">
    <div class="entrar-cartao">
      <img src="/marca/smi-vertical-azul.svg" alt="SMI" class="entrar-logo" width="120" height="120" />
      <h1>${verificar ? "Confirme o seu e-mail" : "Acesso ainda não liberado"}</h1>
      ${
        verificar
          ? `<p class="entrar-sub">Mandamos um link para <strong>${e(s.email)}</strong>. Abra o e-mail (veja também o lixo eletrônico), clique no link e depois volte aqui.</p>
             <button type="button" class="botao botao-grande" data-acao="ja-confirmei">Já confirmei</button>
             <button type="button" class="link-simples" data-acao="reenviar">Mandar o e-mail de novo</button>`
          : `<p class="entrar-sub">O e-mail <strong>${e(s.email)}</strong> ainda não foi incluído na equipe. Peça para a responsável pelo painel incluir você.</p>`
      }
      <p class="entrar-demo"><button type="button" class="link-simples" data-acao="sair">Entrar com outra conta</button></p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Tela: Início do painel
// ---------------------------------------------------------------------------
function telaInicio() {
  const visiveis = dados.materiais.filter((m) => !m.esconder).length;
  const nome = (usuarioAtual() ?? "").split("@")[0];
  const cartao = (href: string, ic: string, titulo: string, texto: string, destaque = false) => `
    <a href="${href}" class="cartao-painel${destaque ? " cartao-destaque" : ""}">
      <span class="cartao-icone">${icone(ic)}</span>
      <span class="cartao-titulo">${titulo}</span>
      <span class="cartao-texto">${texto}</span>
    </a>`;
  return moldura(`
    <h1 class="painel-titulo">Olá${nome ? `, ${e(nome)}` : ""}!</h1>
    <p class="painel-sub">O que você quer fazer hoje?</p>
    <div class="grade-cartoes">
      ${cartao("#/nova", "nova", "Nova revista ou lição", "Colocar um PDF novo no site, em poucos passos.", true)}
      ${cartao("#/materiais", "livros", "Materiais publicados", `${visiveis} no site. Corrigir, esconder ou apagar.`)}
      ${cartao("#/contatos", "contato", "Contatos e redes sociais", "Endereço, telefone, e-mails, Instagram, Facebook…")}
      ${cartao("#/pagina-inicial", "casa", "Página inicial", "Trocar as capas e os cartões da página inicial.")}
      ${cartao("#/livros", "vitrine", "Livros da vitrine", "Livros à venda e o texto de “Como comprar”.")}
      ${ehDono() ? cartao("#/equipe", "equipe", "Equipe", "Quem pode entrar no painel.") : ""}
    </div>`);
}

// ---------------------------------------------------------------------------
// Tela: Nova revista (passo a passo)
// ---------------------------------------------------------------------------
interface Rascunho extends Omit<Material, "slug"> {
  passo: number;
}
function rascunhoVazio(): Rascunho {
  return {
    passo: 1,
    titulo: "",
    secao: null,
    ano: String(new Date().getFullYear()),
    semestre: "",
    publico: "adulto",
    origem: "editora",
    linkDrive: "",
    capaModo: "primeira-pagina",
    capaImagem: "",
    linkOficial: "",
    observacao: "",
    esconder: false,
  };
}
let rascunho = rascunhoVazio();
const PASSOS = ["O arquivo", "Onde aparece", "Informações", "Capa", "Conferir"];

function telaNova() {
  const r = rascunho;
  const passos = PASSOS.map(
    (p, i) => `<li class="${i + 1 === r.passo ? "atual" : i + 1 < r.passo ? "feito" : ""}"><span>${i + 1}</span>${p}</li>`,
  ).join("");
  let corpo = "";
  const id = idDoDrive(r.linkDrive);

  if (r.passo === 1) {
    corpo = `
      <h2>Cole o link do PDF no Google Drive</h2>
      <p class="ajuda">Primeiro envie o PDF para a pasta da igreja no Drive. Depois copie o link dele e cole aqui.</p>
      <label class="campo">
        <span>Link do PDF</span>
        <input type="url" name="linkDrive" value="${e(r.linkDrive)}" placeholder="https://drive.google.com/file/d/…" data-foco data-campo-rascunho />
      </label>
      <div class="previa-link">${
        !r.linkDrive
          ? ""
          : id
            ? `<div class="previa-ok"><span class="mini-capa"><img src="${miniaturaDrive(id)}" alt="" referrerpolicy="no-referrer" /></span><p>${icone("ok")} Encontramos o arquivo. Se a imagem não aparecer, confira se o PDF está compartilhado como <strong>“Qualquer pessoa com o link”</strong>.</p></div>`
            : `<p class="erro">Esse link não parece ser de um arquivo do Google Drive. Copie o link pelo botão <strong>Compartilhar</strong> do Drive.</p>`
      }</div>
      <details class="como">
        <summary>Como copiar o link no Drive?</summary>
        <ol>
          <li>No Google Drive, clique com o botão direito no PDF e escolha <strong>Compartilhar → Compartilhar</strong>.</li>
          <li>Em “Acesso geral”, deixe <strong>Qualquer pessoa com o link</strong> (Leitor).</li>
          <li>Clique em <strong>Copiar link</strong> e cole aqui em cima.</li>
        </ol>
      </details>`;
  } else if (r.passo === 2) {
    corpo = `
      <h2>Onde esse material vai aparecer no site?</h2>
      ${GRUPOS.map(
        (g) => `
        <fieldset class="grupo-opcoes">
          <legend>${e(g.nome)}</legend>
          <div class="opcoes">
            ${g.secoes
              .map(
                (s) =>
                  `<button type="button" class="opcao${r.secao === s.href ? " escolhida" : ""}" data-acao="escolher-secao" data-valor="${e(s.href)}">${e(s.nome)}</button>`,
              )
              .join("")}
          </div>
        </fieldset>`,
      ).join("")}`;
  } else if (r.passo === 3) {
    const ehLicao = r.secao === ESCOLA_SABATINA;
    corpo = `
      <h2>Informações do material</h2>
      <label class="campo">
        <span>Título (como vai aparecer no site)</span>
        <input type="text" name="titulo" value="${e(r.titulo)}" placeholder="${ehLicao ? "Ex.: Lições de Escola Sabatina – 1º semestre 2027 – Tema" : "Ex.: Semana de Oração 2027 – Tema"}" data-foco data-campo-rascunho />
      </label>
      <div class="linha-campos">
        <label class="campo campo-curto">
          <span>Ano</span>
          <input type="number" name="ano" min="1990" max="2100" value="${e(r.ano)}" data-campo-rascunho />
        </label>
        ${
          ehLicao
            ? `<div class="campo"><span>Semestre</span><div class="opcoes">
                ${["1", "2"].map((s) => `<button type="button" class="opcao${r.semestre === s ? " escolhida" : ""}" data-acao="escolher" data-campo="semestre" data-valor="${s}">${s}º semestre</button>`).join("")}
              </div></div>`
            : ""
        }
      </div>
      <div class="campo"><span>Para quem é?</span><div class="opcoes">
        <button type="button" class="opcao${r.publico === "adulto" ? " escolhida" : ""}" data-acao="escolher" data-campo="publico" data-valor="adulto">Adultos</button>
        <button type="button" class="opcao${r.publico === "infantil" ? " escolhida" : ""}" data-acao="escolher" data-campo="publico" data-valor="infantil">Crianças</button>
      </div><small>Materiais para crianças também aparecem em Departamentos › Crianças.</small></div>
      <div class="campo"><span>De onde veio?</span><div class="opcoes">
        ${[
          ["editora", "Editora"],
          ["Conferência Geral", "Conferência Geral"],
        ]
          .map(([v, t]) => `<button type="button" class="opcao${r.origem === v ? " escolhida" : ""}" data-acao="escolher" data-campo="origem" data-valor="${v}">${t}</button>`)
          .join("")}
      </div></div>
      ${
        r.origem === "Conferência Geral"
          ? `<label class="campo"><span>Link no site da Conferência Geral (opcional)</span>
              <input type="url" name="linkOficial" value="${e(r.linkOficial)}" placeholder="https://sda1844.org/…" data-campo-rascunho /></label>`
          : ""
      }`;
  } else if (r.passo === 4) {
    const opcao = (modo: Material["capaModo"], titulo: string, visual: string) => `
      <button type="button" class="opcao-capa${r.capaModo === modo ? " escolhida" : ""}" data-acao="escolher" data-campo="capaModo" data-valor="${modo}">
        <span class="capa-imagem">${visual}</span>
        <span>${titulo}</span>
      </button>`;
    corpo = `
      <h2>Qual capa vai aparecer?</h2>
      <div class="opcoes-capa">
        ${opcao("primeira-pagina", "A 1ª página do PDF", id ? `<img src="${miniaturaDrive(id)}" alt="" referrerpolicy="no-referrer" />` : capaPadrao(r.titulo, r.ano))}
        ${opcao("padrao", "Capa azul padrão", capaPadrao(r.titulo, r.ano))}
        ${opcao(
          "imagem",
          r.capaImagem ? "Minha imagem (trocar)" : "Enviar uma imagem",
          r.capaImagem ? `<img src="${e(img(r.capaImagem))}" alt="" />` : `<span class="capa-vazia">${icone("nova")}<br />Escolher imagem</span>`,
        )}
      </div>
      <input type="file" accept="image/*" hidden data-arquivo="capa-rascunho" />`;
  } else {
    corpo = `
      <h2>Confira antes de publicar</h2>
      <div class="conferir">
        <span class="capa-imagem conferir-capa">${capaDoMaterial(r)}</span>
        <dl>
          <dt>Título</dt><dd>${e(r.titulo)}</dd>
          <dt>Onde aparece</dt><dd>${e(grupoDaSecao(r.secao))} › ${e(nomeDaSecao(r.secao))}</dd>
          <dt>Ano</dt><dd>${e(r.ano || "—")}${r.semestre ? ` · ${r.semestre}º semestre` : ""}</dd>
          <dt>Para</dt><dd>${r.publico === "infantil" ? "Crianças" : "Adultos"}</dd>
          <dt>Origem</dt><dd>${e(r.origem)}</dd>
        </dl>
      </div>
      <p class="ajuda">Depois de publicar, o material aparece no site em alguns minutos.</p>`;
  }

  const podeAvancar =
    (r.passo === 1 && !!id) ||
    (r.passo === 2 && !!r.secao) ||
    (r.passo === 3 && r.titulo.trim().length > 3 && (r.secao !== ESCOLA_SABATINA || !!r.semestre)) ||
    r.passo === 4;

  return moldura(
    `
    <h1 class="painel-titulo">Nova revista ou lição</h1>
    <ol class="passos">${passos}</ol>
    <form class="painel-folha" data-form="nova" novalidate>
      ${corpo}
      <div class="rodape-form">
        ${r.passo > 1 ? `<button type="button" class="botao botao-claro" data-acao="passo-anterior">Voltar</button>` : "<span></span>"}
        ${
          r.passo < 5
            ? `<button type="submit" class="botao" ${podeAvancar ? "" : "disabled"}>Continuar</button>`
            : `<button type="submit" class="botao botao-grande">Publicar no site</button>`
        }
      </div>
    </form>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Materiais publicados
// ---------------------------------------------------------------------------
let filtroBusca = "";
let filtroGrupo = "Todos";

function telaMateriais() {
  const filtros = ["Todos", ...GRUPOS.map((g) => g.nome), "Escondidos"];
  const busca = filtroBusca.toLowerCase();
  const lista = dados.materiais
    .filter((m) => (filtroGrupo === "Escondidos" ? m.esconder : filtroGrupo === "Todos" || grupoDaSecao(m.secao) === filtroGrupo))
    .filter((m) => !busca || m.titulo.toLowerCase().includes(busca))
    .sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0) || Number(b.semestre || 0) - Number(a.semestre || 0) || a.titulo.localeCompare(b.titulo, "pt"));
  return moldura(
    `
    <div class="titulo-com-botao">
      <h1 class="painel-titulo">Materiais publicados</h1>
      <a href="#/nova" class="botao">${icone("nova")} Nova revista</a>
    </div>
    <div class="filtros">
      <input type="search" placeholder="Procurar pelo título…" value="${e(filtroBusca)}" data-acao-input="buscar" aria-label="Procurar pelo título" />
      <div class="opcoes">${filtros
        .map((f) => `<button type="button" class="opcao opcao-pequena${filtroGrupo === f ? " escolhida" : ""}" data-acao="filtrar" data-valor="${e(f)}">${e(f)}</button>`)
        .join("")}</div>
    </div>
    <ul class="lista-materiais">
      ${
        lista.length
          ? lista
              .map(
                (m) => `
        <li>
          <a href="#/material/${encodeURIComponent(m.slug)}" class="item-material${m.esconder ? " escondido" : ""}">
            <span class="capa-imagem mini-capa">${capaDoMaterial(m)}</span>
            <span class="item-texto">
              <strong>${e(m.titulo)}</strong>
              <span>${e(nomeDaSecao(m.secao))}${m.ano ? ` · ${e(m.ano)}` : ""}${m.semestre ? ` · ${m.semestre}º sem.` : ""}${m.publico === "infantil" ? " · Crianças" : ""}</span>
            </span>
            ${m.esconder ? `<span class="selo">Escondido</span>` : ""}
            <span class="item-editar">Editar</span>
          </a>
        </li>`,
              )
              .join("")
          : `<li class="vazio">Nenhum material encontrado.</li>`
      }
    </ul>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Editar um material
// ---------------------------------------------------------------------------
function telaMaterial(slug: string) {
  const m = dados.materiais.find((x) => x.slug === slug);
  if (!m) return moldura(`<p>Material não encontrado.</p>`, { href: "#/materiais", texto: "Materiais" });
  const opcoesSecao = GRUPOS.map(
    (g) => `<optgroup label="${e(g.nome)}">${g.secoes.map((s) => `<option value="${e(s.href)}"${m.secao === s.href ? " selected" : ""}>${e(s.nome)}</option>`).join("")}</optgroup>`,
  ).join("");
  return moldura(
    `
    <h1 class="painel-titulo">Editar material</h1>
    <form class="painel-folha editar-material" data-form="material" data-slug="${e(m.slug)}">
      <div class="editar-capa">
        <span class="capa-imagem">${capaDoMaterial(m)}</span>
        <a href="/biblioteca/${encodeURIComponent(m.slug)}/" target="_blank" rel="noopener" class="link-simples">${icone("site")} Ver no site</a>
      </div>
      <div class="editar-campos">
        <label class="campo"><span>Título</span><input type="text" name="titulo" value="${e(m.titulo)}" required /></label>
        <label class="campo"><span>Link do PDF no Drive</span><input type="url" name="linkDrive" value="${e(m.linkDrive)}" required /></label>
        <label class="campo"><span>Onde aparece</span><select name="secao">${opcoesSecao}</select></label>
        <div class="linha-campos">
          <label class="campo campo-curto"><span>Ano</span><input type="number" name="ano" value="${e(m.ano)}" /></label>
          <label class="campo campo-curto"><span>Semestre</span><select name="semestre">
            <option value=""${!m.semestre ? " selected" : ""}>—</option>
            <option value="1"${m.semestre === "1" ? " selected" : ""}>1º</option>
            <option value="2"${m.semestre === "2" ? " selected" : ""}>2º</option>
          </select></label>
          <label class="campo campo-curto"><span>Para</span><select name="publico">
            <option value="adulto"${m.publico === "adulto" ? " selected" : ""}>Adultos</option>
            <option value="infantil"${m.publico === "infantil" ? " selected" : ""}>Crianças</option>
          </select></label>
        </div>
        <label class="campo"><span>Capa</span><select name="capaModo">
          <option value="primeira-pagina"${m.capaModo === "primeira-pagina" ? " selected" : ""}>A 1ª página do PDF</option>
          <option value="padrao"${m.capaModo === "padrao" ? " selected" : ""}>Capa azul padrão</option>
          <option value="imagem"${m.capaModo === "imagem" ? " selected" : ""}>Minha imagem</option>
        </select></label>
        <div class="so-com-imagem"><button type="button" class="botao botao-claro" data-acao="trocar-capa-material">Escolher imagem da capa</button><input type="file" accept="image/*" hidden data-arquivo="capa-material" /></div>
        <label class="campo"><span>Observação interna (não aparece no site)</span><textarea name="observacao" rows="2">${e(m.observacao)}</textarea></label>
        <div class="rodape-form">
          <span class="acoes-secundarias">
            <button type="button" class="botao botao-claro" data-acao="esconder">${icone("olho")} ${m.esconder ? "Mostrar no site" : "Esconder do site"}</button>
            <button type="button" class="botao botao-perigo" data-acao="apagar">${icone("lixo")} Apagar</button>
          </span>
          <button type="submit" class="botao botao-grande">Salvar</button>
        </div>
      </div>
    </form>`,
    { href: "#/materiais", texto: "Materiais publicados" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Contatos e redes sociais
// ---------------------------------------------------------------------------
function telaContatos() {
  const c = dados.contatos;
  return moldura(
    `
    <h1 class="painel-titulo">Contatos e redes sociais</h1>
    <p class="painel-sub">Aparecem no rodapé de todas as páginas do site. Rede social em branco não aparece.</p>
    <form class="painel-folha" data-form="contatos">
      <h2>Escritório central</h2>
      <label class="campo"><span>Endereço</span><textarea name="endereco" rows="2">${e(c.escritorio.endereco)}</textarea></label>
      <label class="campo"><span>Telefone</span><input type="tel" name="telefone" value="${e(c.escritorio.telefone)}" /></label>
      <h2>E-mails</h2>
      <div data-lista="emails">
        ${c.emails.map((m, i) => `<div class="linha-item"><input type="email" name="email" value="${e(m)}" aria-label="E-mail ${i + 1}" /><button type="button" class="botao-icone" data-acao="remover-linha" title="Tirar este e-mail">${icone("lixo")}</button></div>`).join("")}
      </div>
      <button type="button" class="link-simples" data-acao="adicionar-email">+ Adicionar e-mail</button>
      <h2>Redes sociais</h2>
      <label class="campo"><span>Instagram (link do perfil)</span><input type="url" name="instagram" value="${e(c.redes.instagram)}" placeholder="https://www.instagram.com/perfil" /></label>
      <label class="campo"><span>Facebook (link da página)</span><input type="url" name="facebook" value="${e(c.redes.facebook)}" placeholder="https://www.facebook.com/pagina" /></label>
      <label class="campo"><span>YouTube (link do canal)</span><input type="url" name="youtube" value="${e(c.redes.youtube)}" /></label>
      <label class="campo"><span>WhatsApp (número com DDD)</span><input type="tel" name="whatsapp" value="${e(c.redes.whatsapp)}" placeholder="(11) 99999-9999" /></label>
      <div class="rodape-form"><span></span><button type="submit" class="botao botao-grande">Salvar</button></div>
    </form>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Página inicial (capas e cartões)
// ---------------------------------------------------------------------------
function seletorLink(nome: string, valor: string) {
  const interno = iniciais.paginas.some((p) => p.href === valor);
  return `
    <select name="${nome}" data-seletor-link>
      <option value="">— escolha a página —</option>
      ${iniciais.paginas.map((p) => `<option value="${e(p.href)}"${p.href === valor ? " selected" : ""}>${e(p.titulo)}</option>`).join("")}
      <option value="__externo"${!interno && valor ? " selected" : ""}>Outro endereço (link de fora)…</option>
    </select>
    <input type="url" name="${nome}-externo" value="${interno ? "" : e(valor)}" placeholder="https://…" ${interno || !valor ? "hidden" : ""} />`;
}

function blocoCapas(chave: "literaturas" | "livrosDiversos" | "departamentos") {
  const bloco = dados.inicio[chave];
  const itens = chave === "departamentos" ? dados.inicio.departamentos.itens.map((d) => ({ legenda: d.nome, imagem: d.imagem, link: d.link })) : (bloco as { capas: Capa[] }).capas;
  return `
    <section class="painel-folha" data-bloco="${chave}">
      <label class="campo"><span>Título da seção</span><input type="text" name="titulo" value="${e(bloco.titulo)}" /></label>
      <ul class="lista-capas">
        ${itens
          .map(
            (c, i) => `
          <li class="item-capa" data-indice="${i}">
            <button type="button" class="capa-imagem trocar-imagem" data-acao="trocar-imagem" title="Trocar a imagem">${c.imagem ? `<img src="${e(img(c.imagem))}" alt="" loading="lazy" />` : `<span class="capa-vazia">Sem imagem</span>`}<span class="trocar-texto">Trocar imagem</span></button>
            <input type="file" accept="image/*" hidden />
            <label class="campo"><span>${chave === "departamentos" ? "Nome" : "Legenda"}</span><input type="text" name="legenda" value="${e(c.legenda)}" /></label>
            <label class="campo"><span>Ao clicar, abre</span>${seletorLink("link", c.link)}</label>
            <div class="item-capa-acoes">
              <button type="button" class="botao-icone" data-acao="mover" data-dir="-1" title="Passar para a esquerda"${i === 0 ? " disabled" : ""}>${icone("esquerda")}</button>
              <button type="button" class="botao-icone" data-acao="mover" data-dir="1" title="Passar para a direita"${i === itens.length - 1 ? " disabled" : ""}>${icone("direita")}</button>
              <button type="button" class="botao-icone" data-acao="remover-capa" title="Tirar">${icone("lixo")}</button>
            </div>
          </li>`,
          )
          .join("")}
      </ul>
      <button type="button" class="link-simples" data-acao="adicionar-capa">+ Adicionar ${chave === "departamentos" ? "cartão" : "capa"}</button>
    </section>`;
}

let abaInicio: "literaturas" | "livrosDiversos" | "departamentos" | "transmissoes" = "literaturas";
function telaPaginaInicial() {
  const abas: [typeof abaInicio, string][] = [
    ["literaturas", dados.inicio.literaturas.titulo || "Literaturas"],
    ["livrosDiversos", dados.inicio.livrosDiversos.titulo || "Livros diversos"],
    ["departamentos", dados.inicio.departamentos.titulo || "Departamentos"],
    ["transmissoes", "Transmissões ao vivo"],
  ];
  const t = dados.inicio.transmissoes;
  return moldura(
    `
    <h1 class="painel-titulo">Página inicial</h1>
    <p class="painel-sub">Escolha a parte da página inicial que quer mudar.</p>
    <div class="abas">${abas.map(([k, n]) => `<button type="button" class="aba${abaInicio === k ? " escolhida" : ""}" data-acao="aba" data-valor="${k}">${e(n)}</button>`).join("")}</div>
    <form data-form="pagina-inicial">
      ${
        abaInicio === "transmissoes"
          ? `<section class="painel-folha" data-bloco="transmissoes">
              <label class="campo"><span>Título</span><input type="text" name="titulo" value="${e(t.titulo)}" /></label>
              <label class="campo"><span>Link do canal</span><input type="url" name="linkCanal" value="${e(t.link)}" /></label>
              <div class="item-capa item-capa-largo" data-indice="0">
                <button type="button" class="capa-imagem capa-larga trocar-imagem" data-acao="trocar-imagem">${t.imagem ? `<img src="${e(img(t.imagem))}" alt="" />` : ""}<span class="trocar-texto">Trocar imagem</span></button>
                <input type="file" accept="image/*" hidden />
              </div>
            </section>`
          : blocoCapas(abaInicio)
      }
      <div class="rodape-form"><span></span><button type="submit" class="botao botao-grande">Salvar</button></div>
    </form>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Livros da vitrine
// ---------------------------------------------------------------------------
function telaLivros() {
  const l = dados.livraria;
  return moldura(
    `
    <h1 class="painel-titulo">Livros da vitrine</h1>
    <p class="painel-sub">Aparecem em Download › Livros, só com capa e título (sem download). Livro sem imagem usa a capa azul padrão.</p>
    <form data-form="livros">
      <section class="painel-folha">
        <ul class="grade-livros">
          ${l.livros
            .map(
              (b, i) => `
            <li class="item-capa" data-indice="${i}">
              <button type="button" class="capa-imagem trocar-imagem" data-acao="trocar-imagem" title="Trocar a capa">${b.capa ? `<img src="${e(img(b.capa))}" alt="" loading="lazy" />` : capaPadrao(b.titulo)}<span class="trocar-texto">Trocar capa</span></button>
              <input type="file" accept="image/*" hidden />
              <label class="campo"><span>Título</span><input type="text" name="legenda" value="${e(b.titulo)}" /></label>
              <div class="item-capa-acoes">
                <button type="button" class="botao-icone" data-acao="mover" data-dir="-1" title="Passar para a esquerda"${i === 0 ? " disabled" : ""}>${icone("esquerda")}</button>
                <button type="button" class="botao-icone" data-acao="mover" data-dir="1" title="Passar para a direita"${i === l.livros.length - 1 ? " disabled" : ""}>${icone("direita")}</button>
                ${b.capa ? `<button type="button" class="link-simples link-pequeno" data-acao="tirar-imagem">Usar capa azul</button>` : ""}
                <button type="button" class="botao-icone" data-acao="remover-capa" title="Tirar o livro">${icone("lixo")}</button>
              </div>
            </li>`,
            )
            .join("")}
        </ul>
        <button type="button" class="link-simples" data-acao="adicionar-capa">+ Adicionar livro</button>
      </section>
      <section class="painel-folha">
        <label class="campo"><span>Texto do botão “Como comprar”</span><textarea name="comoComprar" rows="5">${e(l.comoComprar)}</textarea></label>
      </section>
      <div class="rodape-form"><span></span><button type="submit" class="botao botao-grande">Salvar</button></div>
    </form>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Tela: Equipe (só a dona do painel)
// ---------------------------------------------------------------------------
let equipe: { email: string; nome: string }[] | null = null;
function telaEquipe() {
  if (!equipe) {
    nuvem
      .listarEquipe()
      .then((l) => {
        equipe = l.sort((a, b) => a.email.localeCompare(b.email));
        desenhar();
      })
      .catch((erro) => avisar(nuvem.mensagemDeErro(erro), "erro"));
  }
  return moldura(
    `
    <h1 class="painel-titulo">Equipe</h1>
    <p class="painel-sub">Só as pessoas desta lista conseguem entrar no painel.</p>
    <section class="painel-folha">
      <ul class="lista-equipe">
        <li><span><strong>${e(EMAIL_DONO)}</strong><small>Responsável (você)</small></span></li>
        ${
          equipe === null
            ? `<li class="vazio">Carregando…</li>`
            : equipe
                .map(
                  (p) => `<li><span><strong>${e(p.nome || p.email)}</strong><small>${e(p.email)}</small></span>
                  <button type="button" class="botao botao-perigo" data-acao="tirar-pessoa" data-valor="${e(p.email)}">${icone("lixo")} Tirar</button></li>`,
                )
                .join("")
        }
      </ul>
    </section>
    <form class="painel-folha" data-form="equipe">
      <h2>Incluir uma pessoa</h2>
      <div class="linha-campos">
        <label class="campo"><span>Nome</span><input type="text" name="nome" required /></label>
        <label class="campo"><span>E-mail (de preferência Gmail)</span><input type="email" name="email" required /></label>
      </div>
      <p class="ajuda">Depois de incluir, avise a pessoa: ela abre <strong>${e(location.origin)}/admin/</strong> e clica em <strong>Entrar com Google</strong> (se o e-mail for Gmail) ou em <strong>Primeiro acesso</strong> para criar uma senha.</p>
      <div class="rodape-form"><span></span><button type="submit" class="botao botao-grande">Incluir</button></div>
    </form>`,
    { href: "#/", texto: "Início" },
  );
}

// ---------------------------------------------------------------------------
// Leitura dos formulários da página inicial e dos livros (antes de mexer na lista)
// ---------------------------------------------------------------------------
function lerLink(caixa: Element, nome = "link") {
  const sel = caixa.querySelector<HTMLSelectElement>(`select[name="${nome}"]`);
  if (!sel) return "";
  return sel.value === "__externo" ? caixa.querySelector<HTMLInputElement>(`input[name="${nome}-externo"]`)!.value.trim() : sel.value;
}

/** Guarda na memória o que está digitado nos formulários de capas (sem salvar ainda). */
function lerFormularioCapas() {
  const form = raiz.querySelector("form[data-form]");
  if (!form) return;
  const tipo = (form as HTMLElement).dataset.form;
  if (tipo === "pagina-inicial") {
    const bloco = form.querySelector<HTMLElement>("[data-bloco]")!;
    const chave = bloco.dataset.bloco as typeof abaInicio;
    const titulo = bloco.querySelector<HTMLInputElement>('input[name="titulo"]')!.value;
    if (chave === "transmissoes") {
      dados.inicio.transmissoes.titulo = titulo;
      dados.inicio.transmissoes.link = bloco.querySelector<HTMLInputElement>('input[name="linkCanal"]')!.value.trim();
      return;
    }
    const itens = [...bloco.querySelectorAll<HTMLElement>(".item-capa")].map((li, i) => {
      const anterior = chave === "departamentos" ? dados.inicio.departamentos.itens[i] : dados.inicio[chave].capas[i];
      return { legenda: li.querySelector<HTMLInputElement>('input[name="legenda"]')!.value, imagem: anterior?.imagem ?? "", link: lerLink(li) };
    });
    dados.inicio[chave].titulo = titulo;
    if (chave === "departamentos") dados.inicio.departamentos.itens = itens.map((c) => ({ nome: c.legenda, imagem: c.imagem, link: c.link }));
    else dados.inicio[chave].capas = itens;
  } else if (tipo === "livros") {
    dados.livraria.livros = [...form.querySelectorAll<HTMLElement>(".item-capa")].map((li, i) => ({
      titulo: li.querySelector<HTMLInputElement>('input[name="legenda"]')!.value,
      capa: dados.livraria.livros[i]?.capa ?? "",
    }));
    dados.livraria.comoComprar = form.querySelector<HTMLTextAreaElement>('textarea[name="comoComprar"]')!.value;
  }
}

/** A lista (de capas ou livros) que está aberta agora. */
function listaAberta(): { imagem?: string; capa?: string }[] {
  const tipo = raiz.querySelector<HTMLElement>("form[data-form]")?.dataset.form;
  if (tipo === "livros") return dados.livraria.livros;
  if (abaInicio === "departamentos") return dados.inicio.departamentos.itens;
  if (abaInicio === "transmissoes") return [dados.inicio.transmissoes];
  return dados.inicio[abaInicio].capas;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
raiz.addEventListener("click", async (ev) => {
  const alvo = (ev.target as HTMLElement).closest<HTMLElement>("[data-acao]");
  if (!alvo) return;
  const acao = alvo.dataset.acao!;
  const valor = alvo.dataset.valor ?? "";

  switch (acao) {
    case "sair":
      if (DEMO) {
        try {
          sessionStorage.removeItem(CHAVE_USUARIO);
        } catch {
          /* ignora */
        }
        situacao = { tipo: "fora" };
      } else await nuvem.sair();
      equipe = null;
      location.hash = "#/";
      desenhar();
      break;
    case "esqueci": {
      if (DEMO) return avisar("Na versão final, você recebe por e-mail um link para criar uma senha nova.");
      const email = raiz.querySelector<HTMLInputElement>('input[name="email"]')!.value;
      if (!email) return avisar("Escreva o seu e-mail no campo acima e clique de novo em “Esqueci minha senha”.", "erro");
      try {
        await nuvem.esqueciSenha(email);
        avisar(`Mandamos para <strong>${e(email)}</strong> um link para criar uma senha nova.`);
      } catch (erro) {
        avisar(nuvem.mensagemDeErro(erro), "erro");
      }
      break;
    }
    case "google":
      try {
        await nuvem.entrarComGoogle();
      } catch (erro) {
        avisar(nuvem.mensagemDeErro(erro), "erro");
      }
      break;
    case "modo-primeiro":
    case "modo-entrar":
      modoEntrar = acao === "modo-primeiro" ? "primeiro-acesso" : "entrar";
      desenhar();
      break;
    case "reenviar":
      try {
        await nuvem.reenviarConfirmacao();
        avisar("E-mail de confirmação enviado de novo.");
      } catch (erro) {
        avisar(nuvem.mensagemDeErro(erro), "erro");
      }
      break;
    case "ja-confirmei":
      if (await nuvem.conferirVerificacao()) location.reload();
      else avisar("Ainda não aparece como confirmado. Clique no link do e-mail e tente de novo.", "erro");
      break;
    case "tirar-pessoa":
      if (!confirm(`Tirar ${valor} da equipe? A pessoa não vai mais conseguir entrar no painel.`)) return;
      try {
        await nuvem.tirarDaEquipe(valor);
        equipe = equipe?.filter((p) => p.email !== valor) ?? null;
        avisar("Pessoa tirada da equipe.");
        desenhar();
      } catch (erro) {
        avisar(nuvem.mensagemDeErro(erro), "erro");
      }
      break;

    // nova revista
    case "escolher-secao":
      rascunho.secao = valor;
      if (valor !== ESCOLA_SABATINA) rascunho.semestre = "";
      desenhar();
      break;
    case "escolher": {
      const campo = alvo.dataset.campo as keyof Rascunho;
      (rascunho as unknown as Record<string, string>)[campo] = valor;
      if (campo === "capaModo" && valor === "imagem") raiz.querySelector<HTMLInputElement>('[data-arquivo="capa-rascunho"]')?.click();
      desenhar();
      break;
    }
    case "passo-anterior":
      rascunho.passo--;
      desenhar();
      break;

    // materiais
    case "filtrar":
      filtroGrupo = valor;
      desenhar();
      break;
    case "esconder": {
      const m = dados.materiais.find((x) => x.slug === alvo.closest<HTMLElement>("form")!.dataset.slug)!;
      m.esconder = !m.esconder;
      if (!(await salvar(m.esconder ? "Material escondido do site." : "Material voltou a aparecer no site.", { material: m.slug }))) m.esconder = !m.esconder;
      desenhar();
      break;
    }
    case "apagar": {
      const slug = alvo.closest<HTMLElement>("form")!.dataset.slug;
      const m = dados.materiais.find((x) => x.slug === slug)!;
      if (!confirm(`Apagar “${m.titulo}” do site?\n\nO PDF continua guardado no Google Drive. Se só quiser tirar do site por um tempo, use “Esconder do site”.`)) return;
      if (!(await salvar("Material apagado.", { apagar: slug! }))) return;
      dados.materiais = dados.materiais.filter((x) => x.slug !== slug);
      location.hash = "#/materiais";
      break;
    }
    case "trocar-capa-material":
      raiz.querySelector<HTMLInputElement>('[data-arquivo="capa-material"]')?.click();
      break;

    // contatos
    case "adicionar-email": {
      const lista = raiz.querySelector('[data-lista="emails"]')!;
      lista.insertAdjacentHTML(
        "beforeend",
        `<div class="linha-item"><input type="email" name="email" aria-label="Novo e-mail" /><button type="button" class="botao-icone" data-acao="remover-linha" title="Tirar este e-mail">${icone("lixo")}</button></div>`,
      );
      lista.querySelector<HTMLInputElement>(".linha-item:last-child input")!.focus();
      break;
    }
    case "remover-linha":
      alvo.closest(".linha-item")!.remove();
      break;

    // página inicial e livros
    case "aba":
      lerFormularioCapas();
      abaInicio = valor as typeof abaInicio;
      desenhar();
      break;
    case "trocar-imagem":
      alvo.parentElement!.querySelector<HTMLInputElement>('input[type="file"]')!.click();
      break;
    case "tirar-imagem": {
      lerFormularioCapas();
      const i = Number(alvo.closest<HTMLElement>("[data-indice]")!.dataset.indice);
      dados.livraria.livros[i].capa = "";
      desenhar();
      break;
    }
    case "mover":
    case "remover-capa": {
      lerFormularioCapas();
      const lista = listaAberta();
      const i = Number(alvo.closest<HTMLElement>("[data-indice]")!.dataset.indice);
      if (acao === "remover-capa") {
        if (!confirm("Tirar este item da lista?")) return;
        lista.splice(i, 1);
      } else {
        const j = i + Number(alvo.dataset.dir);
        [lista[i], lista[j]] = [lista[j], lista[i]];
      }
      desenhar();
      break;
    }
    case "adicionar-capa": {
      lerFormularioCapas();
      const tipo = raiz.querySelector<HTMLElement>("form[data-form]")!.dataset.form;
      if (tipo === "livros") dados.livraria.livros.push({ titulo: "Novo livro", capa: "" });
      else if (abaInicio === "departamentos") dados.inicio.departamentos.itens.push({ nome: "", imagem: "", link: "" });
      else if (abaInicio !== "transmissoes") dados.inicio[abaInicio].capas.push({ legenda: "", imagem: "", link: "" });
      desenhar();
      raiz.querySelector<HTMLInputElement>(".item-capa:last-child input[name='legenda']")?.select();
      break;
    }
  }
});

// campos que atualizam o rascunho enquanto a pessoa digita
raiz.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.matches("[data-campo-rascunho]")) {
    (rascunho as unknown as Record<string, string>)[el.name] = el.value;
    if (el.name === "linkDrive") {
      // atualiza só a prévia do link (sem redesenhar o campo onde a pessoa está digitando)
      const pos = el.selectionStart;
      desenhar();
      const novo = raiz.querySelector<HTMLInputElement>('input[name="linkDrive"]')!;
      novo.focus();
      novo.setSelectionRange(pos, pos);
    } else {
      const botao = raiz.querySelector<HTMLButtonElement>('form[data-form="nova"] button[type="submit"]');
      if (botao && rascunho.passo === 3)
        botao.disabled = !(rascunho.titulo.trim().length > 3 && (rascunho.secao !== ESCOLA_SABATINA || !!rascunho.semestre));
    }
  }
  if (el.dataset.acaoInput === "buscar") {
    filtroBusca = el.value;
    const pos = el.selectionStart;
    desenhar();
    const novo = raiz.querySelector<HTMLInputElement>('[data-acao-input="buscar"]')!;
    novo.focus();
    novo.setSelectionRange(pos, pos);
  }
});

// escolha de imagens e do "outro endereço" nos links
raiz.addEventListener("change", async (ev) => {
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  if (el.matches("[data-seletor-link]")) {
    const externo = el.parentElement!.querySelector<HTMLInputElement>(`input[name="${el.name}-externo"]`)!;
    externo.hidden = el.value !== "__externo";
    if (!externo.hidden) externo.focus();
    return;
  }
  if (!(el instanceof HTMLInputElement) || el.type !== "file" || !el.files?.[0]) return;
  try {
    const imagem = await guardarImagem(await imagemLeve(el.files[0]));
    if (el.dataset.arquivo === "capa-rascunho") {
      rascunho.capaImagem = imagem;
      rascunho.capaModo = "imagem";
    } else if (el.dataset.arquivo === "capa-material") {
      const m = dados.materiais.find((x) => x.slug === el.closest<HTMLElement>("form")!.dataset.slug)!;
      m.capaImagem = imagem;
      m.capaModo = "imagem";
      avisar("Imagem escolhida. Clique em <strong>Salvar</strong> para confirmar.");
    } else {
      lerFormularioCapas();
      const i = Number(el.closest<HTMLElement>("[data-indice]")!.dataset.indice);
      const item = listaAberta()[i];
      if ("capa" in item) item.capa = imagem;
      else item.imagem = imagem;
      avisar("Imagem trocada. Clique em <strong>Salvar</strong> para confirmar.");
    }
    desenhar();
  } catch (erro) {
    avisar((erro as Error).message, "erro");
  }
});

raiz.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const f = new FormData(form);
  const tipo = form.dataset.form;
  const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const esperando = (sim: boolean) => {
    if (!botao) return;
    botao.disabled = sim;
    botao.classList.toggle("esperando", sim);
  };

  if (tipo === "entrar") {
    const email = String(f.get("email"));
    const senha = String(f.get("senha"));
    if (DEMO) {
      try {
        sessionStorage.setItem(CHAVE_USUARIO, email);
      } catch {
        /* ignora */
      }
      situacao = { tipo: "dentro", email, dono: true };
      location.hash = "#/";
      return desenhar();
    }
    esperando(true);
    try {
      if (modoEntrar === "primeiro-acesso") await nuvem.criarSenha(email, senha);
      else await nuvem.entrarComSenha(email, senha);
      modoEntrar = "entrar";
    } catch (erro) {
      avisar(nuvem.mensagemDeErro(erro), "erro");
      esperando(false);
    }
  } else if (tipo === "nova") {
    if (rascunho.passo < 5) {
      rascunho.passo++;
      desenhar();
      return;
    }
    const { passo: _p, ...novo } = rascunho;
    let slug = slugificar(novo.titulo) || `material-${Date.now()}`;
    while (dados.materiais.some((m) => m.slug === slug)) slug += "-2";
    dados.materiais.push({ ...novo, slug });
    esperando(true);
    if (!(await salvar("Material publicado!", { material: slug }))) {
      dados.materiais = dados.materiais.filter((m) => m.slug !== slug);
      esperando(false);
      return;
    }
    rascunho = rascunhoVazio();
    raiz.innerHTML = moldura(
      `<div class="painel-folha sucesso">
        <span class="sucesso-icone">${icone("ok")}</span>
        <h1 class="painel-titulo">Pronto!</h1>
        <p>O material vai aparecer no site em até 15 minutos.</p>
        <div class="rodape-form centro">
          <a href="#/materiais" class="botao botao-claro">Ver materiais</a>
          <button type="button" class="botao" data-acao="outra">Adicionar outro</button>
        </div>
      </div>`,
    );
    raiz.querySelector('[data-acao="outra"]')!.addEventListener("click", () => {
      location.hash = "#/nova";
      desenhar();
    });
  } else if (tipo === "material") {
    const m = dados.materiais.find((x) => x.slug === form.dataset.slug)!;
    const antes = { ...m };
    Object.assign(m, {
      titulo: String(f.get("titulo")),
      linkDrive: String(f.get("linkDrive")).trim(),
      secao: String(f.get("secao")),
      ano: String(f.get("ano")),
      semestre: String(f.get("semestre")),
      publico: String(f.get("publico")),
      capaModo: String(f.get("capaModo")),
      observacao: String(f.get("observacao")),
    });
    esperando(true);
    if (!(await salvar("Alterações salvas.", { material: m.slug }))) Object.assign(m, antes);
    desenhar();
  } else if (tipo === "contatos") {
    const c = dados.contatos;
    c.escritorio.endereco = String(f.get("endereco"));
    c.escritorio.telefone = String(f.get("telefone"));
    c.emails = f.getAll("email").map(String).map((x) => x.trim()).filter(Boolean);
    for (const r of ["instagram", "facebook", "youtube", "whatsapp"] as const) c.redes[r] = String(f.get(r)).trim();
    esperando(true);
    await salvar("Contatos salvos.", { site: "contatos" });
    desenhar();
  } else if (tipo === "pagina-inicial" || tipo === "livros") {
    lerFormularioCapas();
    esperando(true);
    await salvar("Alterações salvas.", { site: tipo === "livros" ? "livraria" : "inicio" });
    desenhar();
  } else if (tipo === "equipe") {
    const email = String(f.get("email")).trim().toLowerCase();
    const nome = String(f.get("nome")).trim();
    esperando(true);
    try {
      await nuvem.incluirNaEquipe(email, nome);
      equipe = [...(equipe ?? []).filter((p) => p.email !== email), { email, nome }].sort((a, b) => a.email.localeCompare(b.email));
      avisar(`<strong>${e(nome)}</strong> foi incluído(a) na equipe.`);
      desenhar();
    } catch (erro) {
      avisar(nuvem.mensagemDeErro(erro), "erro");
      esperando(false);
    }
  }
});

window.addEventListener("hashchange", () => {
  if (rota() === "nova" && rascunho.passo === 1 && !rascunho.linkDrive) rascunho = rascunhoVazio();
  desenhar();
  window.scrollTo(0, 0);
});

desenhar();
