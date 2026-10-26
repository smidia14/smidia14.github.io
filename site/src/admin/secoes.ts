// Seções do site onde um material da biblioteca pode aparecer, agrupadas como no painel.
// O "href" é o endereço da página no site; o "nome" é o que a equipe vê.
export interface Secao {
  href: string;
  nome: string;
}

export const GRUPOS: { nome: string; secoes: Secao[] }[] = [
  {
    nome: "Escola Sabatina",
    secoes: [{ href: "/departamentos/escola-sabatina/", nome: "Lições da Escola Sabatina" }],
  },
  {
    nome: "Semanas",
    secoes: [
      { href: "/download/semana-de-oracao/", nome: "Semana de Oração" },
      { href: "/download/semana-de-reavivamento/", nome: "Semana de Reavivamento" },
      { href: "/download/semana-da-mordomia-crista/", nome: "Semana da Mordomia" },
      { href: "/departamentos/jovens/semana-da-juventude/", nome: "Semana / Mês da Juventude" },
      { href: "/download/semana-do-calvario/", nome: "Semana do Calvário" },
      { href: "/download/semana-juvenil/", nome: "Semana Juvenil" },
    ],
  },
  {
    nome: "Cursos e Estudos",
    secoes: [{ href: "/download/cursos-e-estudos/", nome: "Cursos e Estudos" }],
  },
  {
    nome: "Departamentos",
    secoes: [
      { href: "/departamentos/familia/", nome: "Família" },
      { href: "/departamentos/bom-samaritano/", nome: "Bom Samaritano" },
      { href: "/departamentos/jovens/", nome: "Jovens" },
      { href: "/departamentos/saude/", nome: "Saúde" },
      { href: "/departamentos/secretaria/", nome: "Secretaria" },
      { href: "/departamentos/educacao/", nome: "Educação" },
      { href: "/departamentos/evangelismo/", nome: "Evangelismo" },
      { href: "/departamentos/literario/", nome: "Literário" },
    ],
  },
  {
    nome: "Doutrinas",
    secoes: [
      { href: "/doutrinas/principios-de-fe/", nome: "Princípios de Fé" },
      { href: "/doutrinas/manual-de-igreja/", nome: "Manual de Igreja" },
      { href: "/doutrinas/manual-de-normas-e-funcoes/", nome: "Manual de Normas e Funções" },
      { href: "/doutrinas/evangelismo-e-liturgia/", nome: "Evangelismo e liturgia" },
      { href: "/doutrinas/renovacao-de-nossa-fidelidade/", nome: "Renovação de Nossa Fidelidade" },
      { href: "/doutrinas/laodiceia/", nome: "Laodicéia" },
    ],
  },
];

export const ESCOLA_SABATINA = "/departamentos/escola-sabatina/";

export function nomeDaSecao(href: string | null | undefined) {
  for (const g of GRUPOS) for (const s of g.secoes) if (s.href === href) return s.nome;
  return "Sem seção";
}

export function grupoDaSecao(href: string | null | undefined) {
  return GRUPOS.find((g) => g.secoes.some((s) => s.href === href))?.nome ?? "Outros";
}
