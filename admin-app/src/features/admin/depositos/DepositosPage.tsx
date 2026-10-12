import type { Deposito, Pagina } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { baixarCsv, Carregando, csvValor, Erro, inputCls, MiniCard, Pagination, Panel, periodoPadrao, pillCls, StatusBadge, Table, todasPaginas, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Receipt, Search, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = { pago: "pagos", pendente: "pendentes", expirado: "expirados" };

export function DepositosPage() {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);
  const [exportando, setExportando] = useState(false);
  const q = useDebounced(busca), vMin = useDebounced(min), vMax = useDebounced(max);

  const filtro = { de: periodo.startDate, ate: periodo.endDate, status: status === "todos" ? undefined : status, q: q.trim(), min: vMin, max: vMax };
  useEffect(() => setPagina(1), [JSON.stringify(filtro), porPagina]); // filtro novo volta pra página 1
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["depositos", filtro, pagina, porPagina],
    queryFn: () => api<Pagina<Deposito, number>>(`/admin/depositos${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = await todasPaginas((p) => api<Pagina<Deposito, number>>(`/admin/depositos${qs({ ...filtro, pagina: p, porPagina: 100 })}`));
      baixarCsv(`depositos_${filtro.de}_${filtro.ate}.csv`, [
        ["ID", "Jogador", "E-mail", "Valor", "Status", "Criado em", "Pago em"],
        ...linhas.map((v) => [v.id, v.nome, v.email, csvValor(v.valor), v.status, dataHora(v.criadoEm), dataHora(v.pagoEm)]),
      ]);
      toast.success(`${num(linhas.length)} depósitos exportados`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  const totalPaginas = data ? Math.ceil(data.total / porPagina) : 0;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Valor no filtro" value={brl(data?.soma)} icon={<Wallet className="h-5 w-5" />} hint={status === "todos" ? "todos os status" : `só ${STATUS_LABEL[status]}`} />
        <MiniCard title="Depósitos no filtro" value={num(data?.total)} icon={<Receipt className="h-5 w-5" />} />
        <MiniCard title="Ticket médio" value={brl(data?.total ? data.soma / data.total : 0)} icon={<Receipt className="h-5 w-5" />} />
      </div>

      <Panel title="Depósitos (Pix)" icon={<Wallet className="h-5 w-5" />}
        actions={<>
          <DateFilter onDateRangeChange={setPeriodo} />
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        </>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Buscar por nome, e-mail ou ID do Pix" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar depósito" />
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="expirado">Expirado</SelectItem>
            </SelectContent>
          </Select>
          <input className={cn(inputCls, "w-[120px]")} type="number" min={0} step="0.01" inputMode="decimal" placeholder="Valor mín." value={min} onChange={(e) => setMin(e.target.value)} aria-label="Valor mínimo" />
          <input className={cn(inputCls, "w-[120px]")} type="number" min={0} step="0.01" inputMode="decimal" placeholder="Valor máx." value={max} onChange={(e) => setMax(e.target.value)} aria-label="Valor máximo" />
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["ID", "Jogador", "E-mail", "Valor", "Status", "Criado em", "Pago em"]} empty={data?.itens.length === 0}>
            {data?.itens.map((v) => (
              <tr key={v.id}>
                <td className="!text-muted-foreground font-mono text-xs" title={String(v.id)}>{String(v.id).length > 12 ? `${String(v.id).slice(0, 12)}…` : v.id}</td>
                <td className="font-medium">{v.nome}</td>
                <td className="!text-muted-foreground">{v.email}</td>
                <td className="font-semibold">{brl(v.valor)}</td>
                <td><StatusBadge status={v.status} /></td>
                <td className="!text-muted-foreground">{dataHora(v.criadoEm)}</td>
                <td className="!text-muted-foreground">{dataHora(v.pagoEm)}</td>
              </tr>
            ))}
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pagination currentPage={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
          <PorPagina valor={porPagina} onChange={setPorPagina} />
        </div>
      </Panel>
    </div>
  );
}

export function PorPagina({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
      Por página
      <Select value={String(valor)} onValueChange={(v) => onChange(+v)}>
        <SelectTrigger className="h-8 w-[76px] rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
