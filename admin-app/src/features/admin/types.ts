import { api } from "@/shared/lib/api";
import { useQuery } from "@tanstack/react-query";

// tipos do contrato docs/ADMIN-API.md. Dinheiro em reais, datas em ms epoch.

export type Periodo = { startDate: string; endDate: string };
export type Pagina<T, S = number> = { itens: T[]; total: number; pagina: number; porPagina: number; soma: S };
export type Qtd = { quantidade: number; valor: number };

export type Deposito = { id: string; userId: number; nome: string; email: string; valor: number; status: "pago" | "pendente" | "expirado"; criadoEm: number; pagoEm: number | null };

export type Dashboard = {
  periodo: { de: string; ate: string; granularidade: "hora" | "dia" };
  depositos: { valor: number; quantidade: number; ticketMedio: number; clientes: number; conversao: number | null; pendentes: Qtd };
  partidas: { quantidade: number; apostado: number; premios: number; taxa: number; jogadores: number; estornadas: number };
  custos: { bonus: number; conversao: number; indicacoes: number; influencers: number; total: number };
  lucroLiquido: number;
  saques: { aprovados: Qtd; pendentes: Qtd };
  caixa: number;
  saldoJogadores: { saldo: number; bonus: number; travado: number };
  jogandoAgora: number;
  alertas: number;
  serie: { rotulo: string; depositos: number; taxa: number; custos: number; lucroLiquido: number; partidas: number }[];
  porJogo: { jogo: string; nome: string; partidas: number; apostado: number; premios: number; taxa: number; jogadores: number }[];
  ultimosDepositos: Deposito[];
};

export type AoVivo = { partidas: { id: number; jogo: string; sala: string; codigo: string | null; aposta: number; pote: number; jogadores: { id: number; nome: string; username: string }[]; desde: number }[] };

export type Conferencia = { depositado: number; jaSacado: number; resultadoPartidas: number; taxaPaga: number; bonusRecebido: number; saldoAgora: number };
export type Saque = {
  id: number; userId: number; nome: string; email: string; chavePix: string; tipoChave: string | null; valor: number;
  status: "pendente" | "aprovado" | "cancelado"; motivo: string | null; criadoEm: number; decididoEm: number | null; decididoPor: string | null;
  conferencia: Conferencia;
};

export type StatusPartida = "settled" | "refunded" | "disputed" | "interrupted" | "playing";
export type Partida = {
  id: number; jogo: string; sala: string; codigo: string | null; status: StatusPartida; aposta: number; pote: number; premio: number; taxa: number;
  jogadores: { id: number; nome: string; username: string; venceu: boolean }[]; criadoEm: number; encerradaEm: number | null;
};

export type Jogador = {
  id: number; nome: string; username: string; email: string; saldo: number; bonus: number; travado: number; depositado: number; sacado: number;
  partidas: number; vitorias: number; criadoEm: number; verificado: boolean; bloqueado: boolean; influencer: string | null; jogandoAgora: boolean;
};

export type TipoBonus = "cadastro" | "manual" | "link" | "indicacao" | "conversao";
export type Bonus = { id: number; tipo: TipoBonus; userId: number; nome: string; email: string; valor: number; motivo: string | null; criadoPor: string | null; criadoEm: number };
export type BonusSoma = { valor: number; porTipo: Partial<Record<TipoBonus, Qtd>> };

export type BonusLink = { id: number; codigo: string; nome: string; valor: number; limite: number | null; resgates: number; totalPago: number; ativo: boolean; esgotado: boolean; criadoPor: string | null; criadoEm: number; link: string };

export type Indicacao = {
  id: number; indicador: { id: number; nome: string }; indicado: { id: number; nome: string }; depositou: boolean;
  partidas: number; status: "pendente" | "liberada"; premio: number | null; comissao: number; criadoEm: number; liberadaEm: number | null;
};
export type IndicacaoSoma = { pendentes: number; liberadas: number; valorPago: number; comissoes: number };

export type Influencer = {
  id: number; userId: number; nome: string; email: string; codigo: string; chavePix: string | null; ativo: boolean; percentual: number | null;
  percentualEfetivo: number; criadoEm: number; cliques: number; pessoas: number; inscritos: number; depositaram: number;
  totalDepositado: number; taxaGerada: number; ganho: number; sacado: number; saquePendente: number; disponivel: number; link: string;
};
export type InfSaque = {
  id: number; influencerId: number; influencer: string; email: string; valor: number; chavePix: string; status: "pendente" | "pago" | "cancelado";
  motivo: string | null; decididoPor: string | null; decididoEm: number | null; criadoEm: number;
};

export type Config = {
  taxaCasa: number;
  taxasJogo: Record<string, number>;   // % própria do jogo; jogo fora daqui usa a taxaCasa
  bonusCadastroAtivo: boolean; bonusCadastro: number;
  saqueMinimo: number; saqueMaxDia: number; saqueExigeDeposito: boolean;
  conversaoPontosAtiva: boolean;
  indicacaoAtiva: boolean; indicacaoPremio: number; indicacaoMinPartidas: number; indicacaoPercentual: number;
  infPercentual: number; infSaqueMinimo: number;
  atualizadoPor: string | null; atualizadoEm: number | null;
};

// fallback se /api/rooms não responder (mesma lista de server/jogos.js)
export type TipoEvento = "inicio" | "jogada" | "recusada" | "relogio" | "tacada" | "resolvido" | "relato" | "ausente" | "voltou" | "saiu" | "erro" | "fim";
/** Um passo da gravação; `visoes` = o que cada assento via depois dele (uma só quando todos veem o mesmo). */
export type Evento = { seq: number; t: number; tipo: TipoEvento; assento: number | null; alerta: string | null; dados: any; visoes: Record<string, any>[] | null };
export type GravacaoItem = {
  id: number; jogo: string; sala: string; codigo: string | null; status: StatusPartida; aposta: number; premio: number;
  jogadores: { id: number; nome: string; username: string; venceu: boolean }[]; criadoEm: number; encerradaEm: number | null;
  eventos: number; alertas: number; recusadas: number; duracao: number;
};
export type Gravacao = {
  partida: {
    id: number; jogo: string; nomeJogo: string; sala: string; codigo: string | null; status: StatusPartida; aposta: number; premio: number; taxa: number;
    criadoEm: number; encerradaEm: number | null;
    jogadores: { id: number; nome: string; username: string; venceu: boolean; assento: number; time: number | null }[];
  };
  alertas: { seq: number | null; t: number | null; assento: number | null; texto: string }[];
  eventos: Evento[];
};

export const JOGOS: Record<string, string> = {
  sinuca: "Sinuca", velha: "Jogo da velha", truco: "Truco paulista", "truco-duplas": "Truco em duplas",
  damas: "Damas", domino: "Dominó", "domino-duplas": "Dominó em duplas",
  poker: "Pôquer", buraco: "Buraco", "buraco-duplas": "Buraco em duplas", cacheta: "Cacheta",
};

/** nomes dos jogos vindos de GET /api/rooms → jogos[] ({id, nome}) */
export function useJogos(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["jogos"],
    queryFn: () => api<{ jogos?: Record<string, { id: string; nome: string }> }>("/rooms"),
    staleTime: Infinity,
    retry: 0,
  });
  const lista = Object.values(data?.jogos ?? {});
  if (!lista.length) return JOGOS;
  return { ...JOGOS, ...Object.fromEntries(lista.map((j) => [j.id, j.nome])) };
}

export const SALAS: Record<string, string> = { bronze: "Bronze", prata: "Prata", ouro: "Ouro", privada: "Privada", treino: "Treino" };
export const TIPOS_BONUS: Record<TipoBonus, string> = { cadastro: "Cadastro", manual: "Dado pelo admin", link: "Link de bônus", indicacao: "Indicação", conversao: "Conversão de pontos" };
