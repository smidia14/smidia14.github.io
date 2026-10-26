// Configuração do Firebase do painel (projeto da conta smidia1914@gmail.com).
// Estes valores NÃO são senhas: o Firebase foi feito para eles ficarem no site. Quem pode
// ler e gravar é decidido pelas regras do Firestore (arquivo firestore.rules, na raiz).
// Enquanto "apiKey" estiver vazio, o painel funciona em MODO DEMONSTRAÇÃO (nada é salvo).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

/** Dona do painel: a única conta que cadastra e tira pessoas da equipe. */
export const EMAIL_DONO = "smidia1914@gmail.com";
