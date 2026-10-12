import type { Indicacao, IndicacaoSoma, Pagina } from "@/features/admin/types";
import { JogadorModal } from "@/features/admin/jogadores/JogadorModal";
import { baixarCsv, Carregando, csvValor, Erro, inputCls, MiniCard, Pagination, Panel, pillCls, StatusBadge, statusLabel, Table, todasPaginas, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, Download, Handshake, Loader2, Percent, Search, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * "Indique e ganhe" entre jogadores: quem indicou quem, o que o amigo já fez e o que o indicador ganhou em bônus.
 * Pendente = falta depositar ou jogar as partidas · Liberada = cumpriu e o prêmio já entrou no bônus do indicador.
 */
export function IndicacoesPage() {
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [ficha, setFicha] = useState<number | null>(null);
  const porPagina = 20;
  const q = useDebounced(busca.trim());

  const filtro = { status: status === "todos" ? undefined : status, q };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["indicacoes", filtro, pagina],
    queryFn: () => api<Pagina<Indicacao, IndicacaoSoma>>(`/admin/indicacoes${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = await todasPaginas((p) => api<Pagina<Indicacao, IndicacaoSoma>>(`/admin/indicacoes${qs({ ...filtro, pagina: p, porPagina: 100 })}`));
      baixarCsv("indicacoes.csv", [
        ["Data", "Quem indicou", "Indicado", "Depositou", "Partidas", "Status", "Prêmio", "Comissão", "Liberada em"],
        ...linhas.map((i) => [dataHora(i.criadoEm), i.indicador?.nome, i.indicado?.nome, i.depositou ? "sim" : "não", i.partidas, statusLabel(i.status), csvValor(i.premio), csvValor(i.comissao), i.liberadaEm ? dataHora(i.liberadaEm) : ""]),
      ]);
      toast.success(`${num(linhas.length)} indicações exportadas`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  const pessoa = (p: { id: number; nome: string } | null | undefined) =>
    p ? <button onClick={() => setFicha(p.id)} className="font-medium hover:text-primary hover:underline text-left">{p.nome}</button> : <span className="!text-muted-foreground">—</span>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Pendentes" value={num(data?.soma.pendentes)} icon={<Clock className="h-5 w-5" />} hint="falta depositar ou jogar" />
        <MiniCard title="Liberadas" value={num(data?.soma.liberadas)} icon={<BadgeCheck className="h-5 w-5" />} hint="cumpriram, prêmio pago" />
        <MiniCard title="Pago em prêmios" value={brl(data?.soma.valorPago)} icon={<Wallet className="h-5 w-5" />} hint="em bônus pros indicadores" />
        <MiniCard title="Comissões" value={brl(data?.soma.comissoes)} icon={<Percent className="h-5 w-5" />} hint="% da taxa que os amigos geram" />
      </div>

      <Panel title="Indicações" icon={<Handshake className="h-5 w-5" />}
        actions={
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        }>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome ou e-mail de quem indicou ou do indicado" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar indicação" />
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[190px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="liberada">Liberadas</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Data", "Quem indicou", "Indicado", "Depositou", "Partidas", "Status", "Prêmio", "Comissão"]} empty={data?.itens.length === 0}>
            {data?.itens.map((i) => (
              <tr key={i.id}>
                <td className="!text-muted-foreground">{dataHora(i.criadoEm)}</td>
                <td>{pessoa(i.indicador)}</td>
                <td>{pessoa(i.indicado)}</td>
                <td className={i.depositou ? "font-semibold !text-[#45BC56]" : "!text-muted-foreground"}>{i.depositou ? "Sim" : "Não"}</td>
                <td className="tabular-nums">{num(i.partidas)}</td>
                <td>
                  <StatusBadge status={i.status} />
                  {i.liberadaEm && <div className="mt-1 text-[11px] !text-muted-foreground">{dataHora(i.liberadaEm)}</div>}
                </td>
                <td className="font-semibold tabular-nums">{i.premio ? brl(i.premio) : "—"}</td>
                <td className={cn("tabular-nums", i.comissao > 0 ? "font-semibold" : "!text-muted-foreground")} title="% da taxa gerada pelo amigo">{i.comissao > 0 ? brl(i.comissao) : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">O prêmio e a comissão entram no bônus de quem indicou. As regras (prêmio, partidas mínimas e % da taxa) ficam em Configurações.</p>
      </Panel>
      {ficha != null && <JogadorModal id={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
