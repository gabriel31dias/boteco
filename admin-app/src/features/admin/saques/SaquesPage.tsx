import type { Pagina, Periodo, Qtd, Saque } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { Carregando, copiar, Erro, inputCls, MiniCard, Pagination, Panel, pillCls, StatusBadge, Table, useDebounced } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Check, Clock, Copy, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Lista = Pagina<Saque, number> & { pendentes: Qtd };

const TIPO_CHAVE: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", celular: "Celular", aleatoria: "Aleatória", evp: "Aleatória" };

/** pede mais do que já colocou + ganhou nas partidas? (regra do contrato) */
export const alertaSaque = (s: Saque) => {
  const c = s.conferencia;
  return !!c && s.valor + c.jaSacado > c.depositado + Math.max(c.resultadoPartidas, 0) + 0.01;
};

export function SaquesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pendente");
  const [periodo, setPeriodo] = useState<Periodo | null>(null); // null = todo o período
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [aprovar, setAprovar] = useState<Saque | null>(null);
  const [cancelar, setCancelar] = useState<Saque | null>(null);
  const [motivo, setMotivo] = useState("");
  const q = useDebounced(busca.trim());

  const filtro = { status, q, de: periodo?.startDate, ate: periodo?.endDate };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["saques", filtro, pagina],
    queryFn: () => api<Lista>(`/admin/saques${qs({ ...filtro, pagina, porPagina: 20 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // pedido novo aparece sozinho
  });

  const decidir = useMutation({
    mutationFn: ({ s, acao }: { s: Saque; acao: "aprovar" | "cancelar" }) => post(`/admin/saques/${s.id}/${acao}`, acao === "cancelar" ? { motivo: motivo.trim() } : {}),
    onSuccess: (_, { s, acao }) => {
      toast.success(acao === "aprovar" ? `Saque de ${brl(s.valor)} aprovado` : "Saque cancelado", {
        description: acao === "cancelar" ? "O valor voltou pro saldo do jogador." : undefined,
      });
      setAprovar(null); setCancelar(null); setMotivo("");
      qc.invalidateQueries({ queryKey: ["saques"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => {
      toast.error("Não deu certo", { description: (e as Error).message });
      qc.invalidateQueries({ queryKey: ["saques"] }); // 409: alguém já decidiu
    },
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Pendentes" value={num(data?.pendentes?.quantidade)} icon={<Clock className="h-5 w-5" />} hint="esperando o Pix" />
        <MiniCard title="Valor pendente" value={brl(data?.pendentes?.valor)} icon={<Banknote className="h-5 w-5" />} hint="a pagar se aprovar tudo" />
        <MiniCard title="Valor no filtro" value={brl(data?.soma)} icon={<Banknote className="h-5 w-5" />} hint={`${num(data?.total)} saques`} />
      </div>

      <Panel title="Saques" icon={<Banknote className="h-5 w-5" />} actions={<DateFilter onDateRangeChange={setPeriodo} label={periodo ? undefined : "Todo o período"} />}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar saque" />
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovado">Aprovados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Pedido", "Jogador", "Chave Pix", "Valor", "Conferência", "Status"]} empty={data?.itens.length === 0 ? (status === "pendente" ? "Nenhum saque esperando. Tudo em dia." : true) : false}>
            {data?.itens.map((s) => {
              const c = s.conferencia;
              const alerta = alertaSaque(s);
              return (
                <tr key={s.id} className="align-top">
                  <td className="!text-muted-foreground">{dataHora(s.criadoEm)}</td>
                  <td><p className="font-medium">{s.nome}</p><p className="text-xs !text-muted-foreground">{s.email}</p></td>
                  <td>
                    <button onClick={() => copiar(s.chavePix, "Chave Pix copiada")} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar chave Pix">
                      {s.chavePix}<Copy className="h-3.5 w-3.5" />
                    </button>
                    {s.tipoChave && <p className="text-[11px] !text-muted-foreground">{TIPO_CHAVE[s.tipoChave] ?? s.tipoChave}</p>}
                  </td>
                  <td className="font-bold text-base">{brl(s.valor)}</td>
                  <td className="text-xs leading-5 !whitespace-normal min-w-[230px]">
                    {c ? <>
                      <p>Depositou (pago): <b>{brl(c.depositado)}</b></p>
                      <p>Já sacou (aprovado): <b>{brl(c.jaSacado)}</b></p>
                      <p>Nas partidas: <b className={c.resultadoPartidas > 0 ? "text-[#45BC56]" : c.resultadoPartidas < 0 ? "text-[#CC0854]" : ""}>{c.resultadoPartidas > 0 ? "ganhou " : c.resultadoPartidas < 0 ? "perdeu " : ""}{brl(Math.abs(c.resultadoPartidas))}</b></p>
                      <p>Taxa paga: <b>{brl(c.taxaPaga)}</b> · bônus recebido: <b>{brl(c.bonusRecebido)}</b></p>
                      <p>Saldo agora: <b>{brl(c.saldoAgora)}</b></p>
                      {alerta && <p className="mt-1 inline-flex items-start gap-1 font-semibold text-[#F59E0B]"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />Pede mais do que depositou + ganhou. Confira antes de pagar.</p>}
                    </> : "—"}
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                    {s.decididoPor && <p className="mt-1 text-[11px] !text-muted-foreground">{s.decididoPor}<br />{dataHora(s.decididoEm)}</p>}
                    {s.status === "cancelado" && s.motivo && <p className="text-[11px] !text-muted-foreground max-w-[180px] !whitespace-normal">{s.motivo}</p>}
                    {s.status === "pendente" && (
                      <div className="mt-2 flex flex-col gap-2 max-w-[130px]">
                        <button onClick={() => setAprovar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full bg-[#45BC56] hover:bg-[#3aa84a] text-white text-xs font-semibold"><Check className="h-3.5 w-3.5" />Aprovar</button>
                        <button onClick={() => setCancelar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border border-[#CC0854]/40 text-[#CC0854] hover:bg-[#CC0854]/10 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancelar</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / 20) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">O saque é manual: faça o Pix pra chave do jogador e depois clique em Aprovar. Enquanto está pendente, o valor fica reservado; se cancelar, volta pro saldo dele.</p>
      </Panel>

      <AlertDialog open={!!aprovar} onOpenChange={(o) => !o && setAprovar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar saque de {aprovar && brl(aprovar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que você <b>já fez o Pix</b> de {aprovar && brl(aprovar.valor)} para a chave <b className="font-mono">{aprovar?.chavePix}</b> ({aprovar?.nome}). Depois de aprovado não dá pra cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {aprovar && alertaSaque(aprovar) && (
            <p className="rounded-xl bg-[#F59E0B]/10 p-3 text-xs font-medium text-[#F59E0B]">Atenção: esse jogador pede mais do que depositou + ganhou nas partidas.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending} onClick={() => aprovar && decidir.mutate({ s: aprovar, acao: "aprovar" })} className="bg-[#45BC56] hover:bg-[#3aa84a] text-white">
              {decidir.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Já fiz o Pix, aprovar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelar} onOpenChange={(o) => { if (!o) { setCancelar(null); setMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar saque de {cancelar && brl(cancelar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>O valor volta pro saldo de {cancelar?.nome}. Ele vê o motivo.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} placeholder="Motivo (ex.: chave Pix não é do titular da conta)" aria-label="Motivo do cancelamento"
            className="w-full rounded-xl border border-border bg-transparent p-3 text-sm outline-none focus:border-primary" />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending || motivo.trim().length < 3} onClick={() => cancelar && decidir.mutate({ s: cancelar, acao: "cancelar" })} className="bg-[#CC0854] hover:bg-[#a80645] text-white">Cancelar saque</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
