// Horários dos cultos transmitidos e aviso de culto especial (congressos, cultos fora do
// horário). A equipe edita no painel, cartão "Transmissões"; ficam em inicio.json → transmissoes.
import inicio from "../data/inicio.json";

const dados = inicio.transmissoes as { horarios?: string; aviso?: string };

export const HORARIOS_PADRAO = "Transmitimos ao vivo os cultos de quarta, sábado e domingo, e também cultos especiais e congressos.";
export const horarios = (dados.horarios ?? "").trim() || HORARIOS_PADRAO;
/** Aviso de culto especial (vazio = não mostra nada). */
export const aviso = (dados.aviso ?? "").trim();
