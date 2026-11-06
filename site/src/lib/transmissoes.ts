// Horários dos cultos transmitidos e aviso de culto especial (congressos, cultos fora do
// horário). A equipe edita no painel, cartão "Transmissões"; ficam em inicio.json → transmissoes.
import inicio from "../data/inicio.json";

const dados = inicio.transmissoes as { horarios?: string; aviso?: string };

export const HORARIOS_PADRAO = "Domingo e quarta, às 19h30 · Sábado, às 9h30. Cultos especiais e congressos também são transmitidos ao vivo.";
export const horarios = (dados.horarios ?? "").trim() || HORARIOS_PADRAO;
/** Aviso de culto especial (vazio = não mostra nada). */
export const aviso = (dados.aviso ?? "").trim();
