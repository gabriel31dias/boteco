import { useJogos, type GravacaoItem, type Pagina } from "@/features/admin/types";
import { PorPagina } from "@/features/admin/depositos/DepositosPage";
import { DateFilter } from "@/shared/components/DateFilter";
import { Carregando, Erro, inputCls, MiniCard, Pagination, Panel, periodoPadrao, pillCls, StatusBadge, statusLabel, Table, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clapperboard, Gamepad2, Hash, Loader2, Play, Search, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/** 75000 → "1min 15s" */
export const duracao = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}min ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}min`;
};

export function GravacoesPage() {
  const jogos = useJogos();
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [jogo, setJogo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [soAlertas, setSoAlertas] = useState(false);
  const [busca, setBusca] = useState("");
  const [id, setId] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const q = useDebounced(busca.trim());
  const idQ = useDebounced(id.replace(/\D/g, ""));

  const filtro = {
    de: periodo.startDate, ate: periodo.endDate, jogo: jogo === "todos" ? undefined : jogo,
    status: status === "todos" ? undefined : status, alertas: soAlertas ? "1" : undefined, q, id: idQ || undefined,
  };
  useEffect(() => setPagina(1), [JSON.stringify(filtro), porPagina]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["gravacoes", filtro, pagina, porPagina],
    queryFn: () => api<Pagina<GravacaoItem, { comAlerta: number }>>(`/admin/gravacoes${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MiniCard title="Partidas gravadas" value={num(data?.total)} icon={<Clapperboard className="h-5 w-5" />} hint="no período e nos filtros" />
        <MiniCard title="Com alerta" value={num(data?.soma.comAlerta)} icon={<AlertTriangle className="h-5 w-5" />}
          hint="erro do servidor, jogada fora da vez, contestada, interrompida ou muitas recusadas" />
      </div>

      <Panel title="Gravações" icon={<Clapperboard className="h-5 w-5" />} actions={<DateFilter onDateRangeChange={setPeriodo} />}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome, @ ou e-mail de um jogador" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <label className="relative w-[130px]">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Partida" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} aria-label="Número da partida" />
          </label>
          <Select value={jogo} onValueChange={setJogo}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Jogo"><Gamepad2 className="h-4 w-4 text-primary shrink-0" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os jogos</SelectItem>
              {Object.entries(jogos).map(([jid, nome]) => <SelectItem key={jid} value={jid}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(["settled", "playing", "refunded", "disputed", "interrupted"] as const).map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={() => setSoAlertas(!soAlertas)} aria-pressed={soAlertas}
            className={cn(pillCls, "inline-flex items-center", soAlertas && "!border-[#CC0854] !text-[#CC0854] bg-[rgba(204,8,84,0.08)]")}>
            <AlertTriangle className="h-4 w-4" />Só com alerta
          </button>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Data", "Jogo", "Jogadores", "Entrada", "Duração", "Eventos", "Alertas", "Status", ""]}
            empty={data?.itens.length === 0 && "Nenhuma gravação com esses filtros. A gravação começou a valer a partir desta versão."}>
            {data?.itens.map((g) => (
              <tr key={g.id} className={cn(g.alertas > 0 && "bg-[rgba(204,8,84,0.04)]")}>
                <td className="!text-muted-foreground">{dataHora(g.criadoEm)}<p className="text-[11px]">#{g.id}</p></td>
                <td className="font-medium">{jogos[g.jogo] ?? g.jogo}</td>
                <td className="!whitespace-normal min-w-[200px]">
                  {g.jogadores.map((j) => (
                    <span key={j.id} className={cn("mr-2 inline-flex items-center gap-1 text-xs", j.venceu ? "font-semibold text-[#45BC56]" : "text-muted-foreground")} title={j.username}>
                      {j.venceu && <Trophy className="h-3 w-3" />}{j.nome}
                    </span>
                  ))}
                </td>
                <td>{brl(g.aposta)}</td>
                <td className="!text-muted-foreground">{duracao(g.duracao)}</td>
                <td className="!text-muted-foreground">{num(g.eventos)}{g.recusadas > 0 && <p className="text-[11px]">{num(g.recusadas)} recusada{g.recusadas > 1 ? "s" : ""}</p>}</td>
                <td>
                  {g.alertas > 0
                    ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[rgba(204,8,84,0.1)] text-[#CC0854]"><AlertTriangle className="h-3 w-3" />{g.alertas}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td><StatusBadge status={g.status} /></td>
                <td>
                  <Link to={`/gravacoes/${g.id}`} className={cn(pillCls, "inline-flex items-center text-primary")}><Play className="h-4 w-4" />Assistir</Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
          <PorPagina valor={porPagina} onChange={setPorPagina} />
        </div>
        <p className="text-xs text-muted-foreground">
          Cada partida grava todas as jogadas, tacadas, saídas e erros, com o que cada jogador via na tela depois de cada passo. Nos jogos de cartas, o admin vê a mão de todos.
          As gravações ficam guardadas por 90 dias.
        </p>
      </Panel>
    </div>
  );
}
