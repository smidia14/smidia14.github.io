// Catálogo das igrejas do Brasil. Os dados vêm da Planilha Google "Catálogo das Igrejas 2026"
// (aba "Para o site"), baixada a cada 10 minutos por scripts/baixar_igrejas.py para src/data/igrejas.json.
// A lista aparece na página Contatos; cada igreja tem a página /igrejas/<id>/.
import dados from "../data/igrejas.json";

export interface Igreja {
  id: string;
  nome: string;
  cidade: string;
  uf: string;
  estado: string;
  endereco: string;
  cep: string;
  pastor: string;
  horarios: string;
  telefone: string;
  telefoneNumero: string; // só dígitos, com 55 na frente ("" se não der para usar em links)
  mapa: string;
  fotos: string[];
}

const ordem = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/** Todas as igrejas, por estado e depois por nome. */
export const igrejas: Igreja[] = [...(dados.igrejas as Igreja[])].sort((a, b) => ordem(a.estado, b.estado) || ordem(a.nome, b.nome));

/** Estados que têm igreja, em ordem alfabética, com a quantidade. */
export const estados = [...new Set(igrejas.map((i) => i.uf))].map((uf) => {
  const lista = igrejas.filter((i) => i.uf === uf);
  return { uf, nome: lista[0].estado, total: lista.length };
});

export const hrefDaIgreja = (i: Igreja) => `/igrejas/${i.id}/`;

/** "Valença · BA", ou só "Bahia" quando o nome da igreja já é o da cidade. */
export const ondeFica = (i: Igreja) => (i.nome === i.cidade ? i.estado : `${i.cidade} · ${i.uf}`);

/** Endereço completo numa linha (para o mapa e para copiar). */
export const enderecoCompleto = (i: Igreja) =>
  [i.endereco, `${i.cidade} - ${i.uf}`, i.cep && `CEP ${i.cep}`].filter(Boolean).join(", ");

/** Mapa embutido do Google (não precisa de chave). Só quando há endereço. */
export const mapaEmbutido = (i: Igreja) =>
  i.endereco ? `https://www.google.com/maps?q=${encodeURIComponent(enderecoCompleto(i))}&output=embed` : "";

/** Link para abrir no Google Maps: o da planilha ou uma busca pelo endereço. */
export const linkDoMapa = (i: Igreja) =>
  i.mapa || (i.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(i))}` : "");

export const linkWhatsApp = (i: Igreja) =>
  i.telefoneNumero
    ? `https://wa.me/${i.telefoneNumero}?text=${encodeURIComponent(`Olá! Vi no site a igreja de ${i.nome} e gostaria de mais informações.`)}`
    : "";
