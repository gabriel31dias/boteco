import { SALAS, useJogos, type Pagina, type Partida } from "@/features/admin/types";
import { PorPagina } from "@/features/admin/depositos/DepositosPage";
import { DateFilter } from "@/shared/components/DateFilter";
import { baixarCsv, Carregando, csvValor, Erro, inputCls, MiniCard, Pagination, Panel, periodoPadrao, pillCls, StatusBadge, statusLabel, Table, todasPaginas, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Coins, Download, Gamepad2, Loader2, Percent, Search, Swords, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Soma = { apostado: number; premios: number; taxa: number };

export function PartidasPage() {
  const jogos = useJogos();
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [jogo, setJogo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [sala, setSala] = useState("todas");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [exportando, setExportando] = useState(false);
  const q = useDebounced(busca.trim());

  const filtro = { de: periodo.startDate, ate: periodo.endDate, jogo: jogo === "todos" ? undefined : jogo, status: status === "todos" ? undefined : status, sala: sala === "todas" ? undefined : sala, q };
  useEffect(() => setPagina(1), [JSON.stringify(filtro), porPagina]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["partidas", filtro, pagina, porPagina],
    queryFn: () => api<Pagina<Partida, Soma>>(`/admin/partidas${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = await todasPaginas((p) => api<Pagina<Partida, Soma>>(`/admin/partidas${qs({ ...filtro, pagina: p, porPagina: 100 })}`));
      baixarCsv(`partidas_${filtro.de}_${filtro.ate}.csv`, [
        ["ID", "Data", "Jogo", "Sala", "Código", "Status", "Jogadores", "Vencedores", "Entrada", "Pote", "Prêmio por vencedor", "Taxa da casa", "Encerrada em"],
        ...linhas.map((p) => [p.id, dataHora(p.criadoEm), jogos[p.jogo] ?? p.jogo, SALAS[p.sala] ?? p.sala, p.codigo, statusLabel(p.status),
          p.jogadores.map((j) => j.nome).join(", "), p.jogadores.filter((j) => j.venceu).map((j) => j.nome).join(", "),
          csvValor(p.aposta), csvValor(p.pote), csvValor(p.premio), csvValor(p.taxa), dataHora(p.encerradaEm)]),
      ]);
      toast.success(`${num(linhas.length)} partidas exportadas`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Partidas" value={num(data?.total)} icon={<Swords className="h-5 w-5" />} hint="no filtro" />
        <MiniCard title="Apostado" value={brl(data?.soma.apostado)} icon={<Coins className="h-5 w-5" />} hint="só partidas pagas" />
        <MiniCard title="Prêmios pagos" value={brl(data?.soma.premios)} icon={<Trophy className="h-5 w-5" />} />
        <MiniCard title="Taxa da casa" value={brl(data?.soma.taxa)} icon={<Percent className="h-5 w-5" />} hint={data?.soma.apostado ? `${((data.soma.taxa / data.soma.apostado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do apostado` : undefined} />
      </div>

      <Panel title="Partidas" icon={<Swords className="h-5 w-5" />}
        actions={<>
          <DateFilter onDateRangeChange={setPeriodo} />
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        </>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome, @ ou e-mail de um jogador" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={jogo} onValueChange={setJogo}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Jogo"><Gamepad2 className="h-4 w-4 text-primary shrink-0" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os jogos</SelectItem>
              {Object.entries(jogos).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sala} onValueChange={setSala}>
            <SelectTrigger className={cn(pillCls, "w-[150px]")} aria-label="Sala"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as salas</SelectItem>
              {Object.entries(SALAS).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(["settled", "playing", "refunded", "disputed", "interrupted"] as const).map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Data", "Jogo", "Sala", "Jogadores", "Entrada", "Pote", "Prêmio", "Taxa", "Status"]} empty={data?.itens.length === 0}>
            {data?.itens.map((p) => (
              <tr key={p.id}>
                <td className="!text-muted-foreground">{dataHora(p.criadoEm)}<p className="text-[11px]">#{p.id}</p></td>
                <td className="font-medium">{jogos[p.jogo] ?? p.jogo}</td>
                <td className="!text-muted-foreground">{SALAS[p.sala] ?? p.sala}{p.codigo && <p className="text-[11px] font-mono">{p.codigo}</p>}</td>
                <td className="!whitespace-normal min-w-[200px]">
                  {p.jogadores.map((j) => (
                    <span key={j.id} className={cn("mr-2 inline-flex items-center gap-1 text-xs", j.venceu ? "font-semibold text-[#45BC56]" : "text-muted-foreground")} title={j.username}>
                      {j.venceu && <Trophy className="h-3 w-3" />}{j.nome}
                    </span>
                  ))}
                </td>
                <td>{brl(p.aposta)}</td>
                <td>{brl(p.pote)}</td>
                <td>{brl(p.premio)}</td>
                <td className={cn("font-semibold", p.taxa > 0 && "!text-[#45BC56]")}>{brl(p.taxa)}</td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
          <PorPagina valor={porPagina} onChange={setPorPagina} />
        </div>
        <p className="text-xs text-muted-foreground">A casa não aposta: fica com a taxa de cada partida paga (pote − prêmios). Estornada, contestada ou interrompida devolve a entrada de cada um e não gera taxa.</p>
      </Panel>
    </div>
  );
}
