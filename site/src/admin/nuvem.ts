// Ligação do painel com o Firebase: login, leitura e gravação dos dados.
//
// Onde fica cada coisa no Firestore:
//   materiais/<nome>      um documento por material da biblioteca
//   site/contatos         contatos e redes sociais
//   site/inicio           capas e cartões da página inicial
//   site/livraria         livros da vitrine e "Como comprar"
//   imagens/<id>          imagens enviadas pelo painel (WebP leve, em texto "data:")
//   equipe/<e-mail>       quem pode usar o painel (só a dona cadastra)
// O GitHub busca esses dados a cada 10 minutos e atualiza o site
// (site/scripts/baixar_painel.py e .github/workflows/sincronizar.yml).
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { firebaseConfig, EMAIL_DONO } from "./firebase-config";

export const configurado = !!firebaseConfig.apiKey;

const app = configurado ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
if (auth) auth.languageCode = "pt-BR"; // e-mails de verificação e de senha em português

export type Situacao =
  | { tipo: "fora" }
  | { tipo: "sem-verificar"; email: string }
  | { tipo: "sem-permissao"; email: string }
  | { tipo: "dentro"; email: string; dono: boolean };

const emailDe = (u: User) => (u.email ?? "").toLowerCase();

/** Avisa sempre que alguém entra ou sai, já dizendo se essa pessoa pode usar o painel. */
export function acompanharLogin(aoMudar: (s: Situacao) => void) {
  if (!auth || !db) return;
  onAuthStateChanged(auth, async (u) => {
    if (!u) return aoMudar({ tipo: "fora" });
    const email = emailDe(u);
    if (!u.emailVerified) return aoMudar({ tipo: "sem-verificar", email });
    const dono = email === EMAIL_DONO;
    if (dono) return aoMudar({ tipo: "dentro", email, dono });
    try {
      const ficha = await getDoc(doc(db, "equipe", email));
      aoMudar(ficha.exists() ? { tipo: "dentro", email, dono } : { tipo: "sem-permissao", email });
    } catch {
      aoMudar({ tipo: "sem-permissao", email });
    }
  });
}

// ---- Login ----
export async function entrarComGoogle() {
  await signInWithPopup(auth!, new GoogleAuthProvider());
}
export async function entrarComSenha(email: string, senha: string) {
  await signInWithEmailAndPassword(auth!, email.trim(), senha);
}
/** Primeiro acesso: cria a senha e manda o e-mail de confirmação. */
export async function criarSenha(email: string, senha: string) {
  const { user } = await createUserWithEmailAndPassword(auth!, email.trim(), senha);
  await sendEmailVerification(user);
}
export async function reenviarConfirmacao() {
  if (auth?.currentUser) await sendEmailVerification(auth.currentUser);
}
export async function esqueciSenha(email: string) {
  await sendPasswordResetEmail(auth!, email.trim());
}
export async function sair() {
  if (auth) await signOut(auth);
}
/** Depois de clicar no link do e-mail de confirmação: confere de novo. */
export async function conferirVerificacao() {
  await auth?.currentUser?.reload();
  return !!auth?.currentUser?.emailVerified;
}

/** Mensagens de erro do Firebase em português. */
export function mensagemDeErro(erro: unknown) {
  const codigo = (erro as { code?: string })?.code ?? "";
  const mensagens: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe acesso com esse e-mail. Se é o seu primeiro acesso, clique em “Primeiro acesso”.",
    "auth/email-already-in-use": "Esse e-mail já tem senha. Use “Entrar” ou “Esqueci minha senha”.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Esse e-mail não parece certo.",
    "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes de terminar.",
    "auth/network-request-failed": "Sem conexão com a internet.",
    "permission-denied": "Você não tem permissão para isso. Fale com a responsável pelo painel.",
  };
  return mensagens[codigo] ?? "Algo deu errado. Tente de novo em instantes.";
}

// ---- Dados ----
export interface DadosNuvem {
  materiais: Record<string, unknown>[];
  contatos: unknown;
  inicio: unknown;
  livraria: unknown;
}

/** Lê tudo o que o painel edita. Devolve null se o banco ainda estiver vazio (primeira vez). */
export async function lerTudo(): Promise<DadosNuvem | null> {
  const [mats, contatos, inicio, livraria] = await Promise.all([
    getDocs(collection(db!, "materiais")),
    getDoc(doc(db!, "site", "contatos")),
    getDoc(doc(db!, "site", "inicio")),
    getDoc(doc(db!, "site", "livraria")),
  ]);
  if (mats.empty && !contatos.exists()) return null;
  return {
    materiais: mats.docs.map((d) => ({ ...d.data(), slug: d.id })),
    contatos: contatos.data(),
    inicio: inicio.data(),
    livraria: livraria.data(),
  };
}

/** Primeira vez: copia para o banco os dados que já estão no site. */
export async function preencherPrimeiraVez(d: DadosNuvem) {
  const lotes: ReturnType<typeof writeBatch>[] = [];
  let lote = writeBatch(db!);
  let n = 0;
  for (const m of d.materiais) {
    const { slug, ...resto } = m as { slug: string };
    lote.set(doc(db!, "materiais", slug), resto);
    if (++n % 400 === 0) {
      lotes.push(lote);
      lote = writeBatch(db!);
    }
  }
  lote.set(doc(db!, "site", "contatos"), d.contatos as object);
  lote.set(doc(db!, "site", "inicio"), d.inicio as object);
  lote.set(doc(db!, "site", "livraria"), d.livraria as object);
  lotes.push(lote);
  for (const l of lotes) await l.commit();
}

const comData = <T extends object>(o: T) => ({ ...o, alteradoEm: serverTimestamp() });

export async function gravarMaterial(m: { slug: string } & Record<string, unknown>) {
  const { slug, ...resto } = m;
  await setDoc(doc(db!, "materiais", slug), comData(resto));
}
export async function apagarMaterial(slug: string) {
  await deleteDoc(doc(db!, "materiais", slug));
}
export async function gravarSite(nome: "contatos" | "inicio" | "livraria", valor: object) {
  await setDoc(doc(db!, "site", nome), comData(valor));
}

// ---- Imagens enviadas pelo painel ("painel:<id>" no lugar do endereço) ----
const cacheImagens = new Map<string, string>();
export async function guardarImagem(dataUrl: string) {
  const ref = await addDoc(collection(db!, "imagens"), { dados: dataUrl, criadaEm: serverTimestamp() });
  cacheImagens.set(ref.id, dataUrl);
  return `painel:${ref.id}`;
}
/** Endereço para mostrar uma imagem: as do painel vêm do banco (até o site ser atualizado). */
export function enderecoDaImagem(valor: string, aoCarregar: () => void) {
  if (!valor.startsWith("painel:")) return valor;
  const id = valor.slice(7);
  if (cacheImagens.has(id)) return cacheImagens.get(id)!;
  if (db)
    getDoc(doc(db, "imagens", id)).then((d) => {
      if (d.exists()) {
        cacheImagens.set(id, d.data().dados);
        aoCarregar();
      }
    });
  return "";
}

// ---- Equipe (só a dona) ----
export async function listarEquipe() {
  const r = await getDocs(collection(db!, "equipe"));
  return r.docs.map((d) => ({ email: d.id, nome: (d.data().nome as string) ?? "" }));
}
export async function incluirNaEquipe(email: string, nome: string) {
  await setDoc(doc(db!, "equipe", email.trim().toLowerCase()), { nome: nome.trim(), incluidoEm: serverTimestamp() });
}
export async function tirarDaEquipe(email: string) {
  await deleteDoc(doc(db!, "equipe", email));
}
