// Configuração do Firebase do painel (projeto da conta smidia1914@gmail.com).
// Estes valores NÃO são senhas: o Firebase foi feito para eles ficarem no site. Quem pode
// ler e gravar é decidido pelas regras do Firestore (arquivo firestore.rules, na raiz).
// Enquanto "apiKey" estiver vazio, o painel funciona em MODO DEMONSTRAÇÃO (nada é salvo).
export const firebaseConfig = {
  apiKey: "AIzaSyCevV_98p8A2EgEEmYsUmHmAdQELrFv3bc",
  authDomain: "site-smi.firebaseapp.com",
  projectId: "site-smi",
  storageBucket: "site-smi.firebasestorage.app",
  messagingSenderId: "572906788836",
  appId: "1:572906788836:web:10306a8949989c8f5cd9f1",
};

/** Dona do painel: a única conta que cadastra e tira pessoas da equipe. */
export const EMAIL_DONO = "smidia1914@gmail.com";
